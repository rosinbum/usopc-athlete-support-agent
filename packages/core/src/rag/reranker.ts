import type { Document } from "@langchain/core/documents";
import { AUTHORITY_LEVELS, type AuthorityLevel } from "@usopc/shared";

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
    if (ngbIds?.includes(doc.metadata.ngbId)) {
      score += 0.2;
    }
    if (topicDomain && doc.metadata.topicDomain === topicDomain) {
      score += 0.15;
    }

    // Recency bonus (documents from last year get a small boost)
    if (doc.metadata.effectiveDate) {
      const effectiveDate = new Date(doc.metadata.effectiveDate);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (effectiveDate > oneYearAgo) {
        score += 0.05;
      }
    }

    // Priority boost for high-priority document types
    if (
      ["bylaws", "legislation", "selection_procedures"].includes(
        doc.metadata.documentType,
      )
    ) {
      score += 0.1;
    }

    // Authority level boost (higher authority = larger boost)
    if (doc.metadata.authorityLevel) {
      const authorityIndex = AUTHORITY_LEVELS.indexOf(
        doc.metadata.authorityLevel as AuthorityLevel,
      );
      if (authorityIndex !== -1) {
        // Higher index = lower authority = less boost
        // Range: 0.3 (law, index 0) to 0 (educational_guidance, index 8)
        const maxBoost = 0.3;
        score +=
          maxBoost * (1 - authorityIndex / (AUTHORITY_LEVELS.length - 1));
      }
    }

    return { doc, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(({ doc }) => doc);
}
