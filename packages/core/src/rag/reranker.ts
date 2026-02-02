import type { Document } from "@langchain/core/documents";

/**
 * Reranks documents based on relevance signals:
 * - Vector similarity score
 * - Metadata match (boost for exact NGB/topic match)
 * - Document recency (boost for newer documents)
 */
export function rerank(
  documents: Document[],
  options: {
    ngbIds?: string[];
    topicDomain?: string;
    maxResults?: number;
  } = {},
): Document[] {
  const { ngbIds, topicDomain, maxResults = 10 } = options;

  const scored = documents.map((doc) => {
    let score = 0;

    // Metadata match bonuses
    if (ngbIds?.includes(doc.metadata.ngb_id)) {
      score += 0.2;
    }
    if (topicDomain && doc.metadata.topic_domain === topicDomain) {
      score += 0.15;
    }

    // Recency bonus (documents from last year get a small boost)
    if (doc.metadata.effective_date) {
      const effectiveDate = new Date(doc.metadata.effective_date);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (effectiveDate > oneYearAgo) {
        score += 0.05;
      }
    }

    // Priority boost for high-priority document types
    if (
      ["bylaws", "legislation", "selection_procedures"].includes(
        doc.metadata.document_type,
      )
    ) {
      score += 0.1;
    }

    return { doc, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(({ doc }) => doc);
}
