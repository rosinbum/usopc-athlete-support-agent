import type { Document } from "@langchain/core/documents";
import { HEADING_PATTERNS } from "./headingPatterns.js";

/**
 * Walk through each chunk and attempt to extract a section title from the
 * beginning of its content. The first matching pattern wins. The extracted
 * title is stored in `metadata.section_title`.
 */
export function extractSections(chunks: Document[]): Document[] {
  return chunks.map((chunk) => {
    let sectionTitle: string | undefined;

    for (const pattern of HEADING_PATTERNS) {
      const match = chunk.pageContent.match(pattern);
      if (match) {
        sectionTitle = match[1]!.trim();
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
