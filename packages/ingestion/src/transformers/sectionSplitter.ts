import type { Document } from "@langchain/core/documents";
import { createSplitter } from "./splitter.js";

/**
 * Patterns that mark the start of a new section in legal / governance
 * documents.  Each regex must match from the beginning of a line.
 */
const SECTION_BOUNDARY =
  /^(ARTICLE\s+[IVXLCDM\d]+[.:]\s*.+|SECTION\s+[\d.]+[.:]\s*.+|Section\s+[\d.]+[.:]\s*.+|CHAPTER\s+[\d]+[.:]\s*.+|PART\s+[IVXLCDM\d]+[.:]\s*.+|Rule\s+[\d.]+[.:]\s*.+)/im;

/**
 * Title extraction patterns — same as sectionExtractor.ts.  First match
 * wins and becomes `metadata.section_title`.
 */
const TITLE_PATTERNS: RegExp[] = [
  /^(ARTICLE\s+[IVXLCDM\d]+[.:]\s*.+)/im,
  /^(SECTION\s+[\d.]+[.:]\s*.+)/im,
  /^(Section\s+[\d.]+[.:]\s*.+)/im,
  /^(CHAPTER\s+[\d]+[.:]\s*.+)/im,
  /^(Rule\s+[\d.]+[.:]\s*.+)/im,
];

/** Extract a section title from the start of a text block. */
function detectTitle(text: string): string | undefined {
  for (const pattern of TITLE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1]!.trim();
  }
  return undefined;
}

interface SectionAwareSplitOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Split documents into section-aware chunks.
 *
 * 1. Each document is segmented at recognised section headings.
 * 2. Sections that fit within `chunkSize` become a single chunk.
 * 3. Larger sections are sub-split with the standard
 *    {@link createSplitter RecursiveCharacterTextSplitter}.
 * 4. Every chunk inherits the section's `section_title` in metadata.
 * 5. Documents with no detectable headings fall through to the standard
 *    splitter unchanged.
 */
export async function sectionAwareSplit(
  documents: Document[],
  options?: SectionAwareSplitOptions,
): Promise<Document[]> {
  const chunkSize = options?.chunkSize ?? 1500;
  const chunkOverlap = options?.chunkOverlap ?? 200;
  const splitter = createSplitter({ chunkSize, chunkOverlap });

  const allChunks: Document[] = [];

  for (const doc of documents) {
    const sections = splitIntoSections(doc.pageContent);

    // No headings detected — fall back to standard splitter
    if (sections.length === 1 && sections[0]!.title === undefined) {
      const fallback = await splitter.splitDocuments([doc]);
      // Attempt title detection on each fallback chunk (same as old extractor)
      for (const chunk of fallback) {
        chunk.metadata = {
          ...chunk.metadata,
          section_title: detectTitle(chunk.pageContent),
        };
      }
      allChunks.push(...fallback);
      continue;
    }

    for (const section of sections) {
      if (section.content.length <= chunkSize) {
        allChunks.push({
          pageContent: section.content,
          metadata: {
            ...doc.metadata,
            section_title: section.title,
          },
        });
      } else {
        const subDoc: Document = {
          pageContent: section.content,
          metadata: doc.metadata,
        };
        const subChunks = await splitter.splitDocuments([subDoc]);
        for (const chunk of subChunks) {
          chunk.metadata = {
            ...chunk.metadata,
            section_title: section.title,
          };
        }
        allChunks.push(...subChunks);
      }
    }
  }

  return allChunks;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface Section {
  title: string | undefined;
  content: string;
}

/**
 * Split raw text into sections at heading boundaries.  The heading line
 * is included in the section content so the LLM can read it in context.
 */
function splitIntoSections(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentLines: string[] = [];
  let currentTitle: string | undefined;

  for (const line of lines) {
    const match = line.match(SECTION_BOUNDARY);
    if (match) {
      // Flush previous section
      if (currentLines.length > 0) {
        const content = currentLines.join("\n").trim();
        if (content.length > 0) {
          sections.push({ title: currentTitle, content });
        }
      }
      currentTitle = match[1]!.trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // Flush final section
  if (currentLines.length > 0) {
    const content = currentLines.join("\n").trim();
    if (content.length > 0) {
      sections.push({ title: currentTitle, content });
    }
  }

  return sections;
}
