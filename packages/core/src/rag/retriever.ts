import type { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import type { Document } from "@langchain/core/documents";

export interface RetrievalOptions {
  ngbIds?: string[];
  topicDomain?: string;
  topK?: number;
  confidenceThreshold?: number;
}

export interface RetrievalResult {
  documents: Document[];
  confidence: number;
}

/**
 * Two-stage retrieval:
 * 1. Narrow filter: search with NGB + topic metadata filtering
 * 2. If confidence < threshold, broaden: search without NGB filter
 */
export async function retrieve(
  vectorStore: PGVectorStore,
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievalResult> {
  const {
    ngbIds,
    topicDomain,
    topK = 10,
    confidenceThreshold = 0.5,
  } = options;

  // Stage 1: Narrow search with filters
  let filter: Record<string, any> = {};
  if (ngbIds && ngbIds.length > 0) {
    filter.ngb_id = { $in: ngbIds };
  }
  if (topicDomain) {
    filter.topic_domain = topicDomain;
  }

  const narrowResults = await vectorStore.similaritySearchWithScore(
    query,
    Math.min(topK, 5),
    Object.keys(filter).length > 0 ? filter : undefined,
  );

  // Calculate confidence from top scores
  const narrowConfidence =
    narrowResults.length > 0
      ? narrowResults.reduce((sum, [, score]) => sum + score, 0) /
        narrowResults.length
      : 0;

  // Stage 2: Broaden if confidence is low
  if (
    narrowConfidence < confidenceThreshold &&
    Object.keys(filter).length > 0
  ) {
    // Remove NGB filter but keep topic if present
    const broadFilter: Record<string, any> = {};
    if (topicDomain) {
      broadFilter.topic_domain = topicDomain;
    }

    const broadResults = await vectorStore.similaritySearchWithScore(
      query,
      topK,
      Object.keys(broadFilter).length > 0 ? broadFilter : undefined,
    );

    // Merge and deduplicate, preferring narrow results
    const seenIds = new Set(narrowResults.map(([doc]) => doc.metadata.id));
    const merged = [...narrowResults];
    for (const result of broadResults) {
      if (!seenIds.has(result[0].metadata.id)) {
        merged.push(result);
        seenIds.add(result[0].metadata.id);
      }
    }

    // Sort by score descending and take topK
    merged.sort((a, b) => b[1] - a[1]);
    const topResults = merged.slice(0, topK);

    const avgConfidence =
      topResults.length > 0
        ? topResults.reduce((sum, [, score]) => sum + score, 0) /
          topResults.length
        : 0;

    return {
      documents: topResults.map(([doc]) => doc),
      confidence: avgConfidence,
    };
  }

  return {
    documents: narrowResults.map(([doc]) => doc),
    confidence: narrowConfidence,
  };
}
