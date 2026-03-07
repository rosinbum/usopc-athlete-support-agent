import type { Document } from "@langchain/core/documents";
import { createSplitter } from "./splitter.js";
import { HEADING_BOUNDARY, detectTitle } from "./headingPatterns.js";

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
 * Minimum content length for a section to be emitted as its own chunk.
 * Sections shorter than this are prepended to the following section
 * (common for heading-only lines like "Section 3.9 The Chair.").
 */
const MIN_SECTION_CONTENT = 50;

/**
 * Split raw text into sections at heading boundaries.  The heading line
 * is included in the section content so the LLM can read it in context.
 */
function splitIntoSections(text: string): Section[] {
  const lines = text.split("\n");
  const raw: Section[] = [];
  let currentLines: string[] = [];
  let currentTitle: string | undefined;

  for (const line of lines) {
    const match = line.match(HEADING_BOUNDARY);
    if (match) {
      // Flush previous section
      if (currentLines.length > 0) {
        const content = currentLines.join("\n").trim();
        if (content.length > 0) {
          raw.push({ title: currentTitle, content });
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
      raw.push({ title: currentTitle, content });
    }
  }

  // Merge heading-only sections into the following section so we don't
  // emit tiny chunks that are just a title with no body.
  const merged: Section[] = [];
  for (let i = 0; i < raw.length; i++) {
    const section = raw[i]!;
    if (
      section.content.length < MIN_SECTION_CONTENT &&
      section.title !== undefined &&
      i + 1 < raw.length
    ) {
      // Prepend this heading-only content to the next section
      const next = raw[i + 1]!;
      next.content = section.content + "\n" + next.content;
      // Keep the next section's own title (more specific)
    } else {
      merged.push(section);
    }
  }

  return merged;
}
