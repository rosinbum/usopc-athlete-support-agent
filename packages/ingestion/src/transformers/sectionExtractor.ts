import type { Document } from "@langchain/core/documents";

/**
 * Patterns used to detect section headings commonly found in legal and
 * governance documents (articles, sections, chapters, rules).
 */
const SECTION_PATTERNS: RegExp[] = [
  /^(ARTICLE\s+[IVXLCDM\d]+[.:]\s*.+)/im,
  /^(SECTION\s+[\d.]+[.:]\s*.+)/im,
  /^(Section\s+[\d.]+[.:]\s*.+)/im,
  /^(CHAPTER\s+[\d]+[.:]\s*.+)/im,
  /^(Rule\s+[\d.]+[.:]\s*.+)/im,
];

/**
 * Walk through each chunk and attempt to extract a section title from the
 * beginning of its content. The first matching pattern wins. The extracted
 * title is stored in `metadata.section_title`.
 */
export function extractSections(chunks: Document[]): Document[] {
  return chunks.map((chunk) => {
    let sectionTitle: string | undefined;

    for (const pattern of SECTION_PATTERNS) {
      const match = chunk.pageContent.match(pattern);
      if (match) {
        sectionTitle = match[1].trim();
        break;
      }
    }

    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        section_title: sectionTitle,
      },
    };
  });
}
