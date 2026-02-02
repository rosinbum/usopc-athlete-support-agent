import { logger } from "@usopc/shared";
import { RETRIEVAL_CONFIG } from "../../config/index.js";
import type { AgentState } from "../state.js";
import type { RetrievedDocument } from "../../types/index.js";

const log = logger.child({ service: "retriever-node" });

/**
 * Minimal interface for the vector store dependency.
 *
 * This keeps the node decoupled from a specific PGVectorStore
 * implementation while still allowing full type safety. Any
 * store that implements `similaritySearchWithScore` can be used.
 */
export interface VectorStoreLike {
  similaritySearchWithScore(
    query: string,
    k: number,
    filter?: Record<string, unknown>,
  ): Promise<
    Array<[{ pageContent: string; metadata: Record<string, unknown> }, number]>
  >;
}

/**
 * Extracts the text content from the last user message.
 */
function getLastUserMessage(state: AgentState): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (
      msg._getType() === "human" ||
      (msg as unknown as Record<string, unknown>).role === "user"
    ) {
      return typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    }
  }
  return "";
}

/**
 * Builds a metadata filter object from the agent state.
 *
 * When NGB IDs and/or a topic domain are present, the filter narrows
 * the search to relevant document partitions. When neither is available,
 * returns `undefined` to perform an unfiltered search.
 */
function buildFilter(
  state: AgentState,
): Record<string, unknown> | undefined {
  const conditions: Record<string, unknown> = {};

  if (state.detectedNgbIds.length > 0) {
    // Use `$in` for multiple NGB IDs
    conditions["ngbId"] =
      state.detectedNgbIds.length === 1
        ? state.detectedNgbIds[0]
        : { $in: state.detectedNgbIds };
  }

  if (state.topicDomain) {
    conditions["topicDomain"] = state.topicDomain;
  }

  return Object.keys(conditions).length > 0 ? conditions : undefined;
}

/**
 * Computes a retrieval confidence score from the raw similarity scores.
 *
 * Uses the top-K scores to calculate:
 *  - bestScore: raw top score (normalized 0-1, higher is better)
 *  - avgScore: average of all scores
 *  - spread: difference between best and worst (signals cluster quality)
 *
 * These are combined into a single 0-1 confidence value.
 */
function computeConfidence(scores: number[]): number {
  if (scores.length === 0) return 0;

  const bestScore = scores[0];
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Similarity scores from pgvector cosine distance are typically in
  // [0, 2] range where 0 is identical. Convert to a 0-1 similarity.
  // If the store already returns normalized similarity (0-1), this
  // still works correctly.
  const normalizedBest = Math.max(0, Math.min(1, 1 - bestScore));
  const normalizedAvg = Math.max(0, Math.min(1, 1 - avgScore));

  // Weight the best score heavily (60%) with average providing a
  // secondary signal (40%).
  return normalizedBest * 0.6 + normalizedAvg * 0.4;
}

/**
 * Factory function that creates a RETRIEVER node bound to a specific
 * vector store instance.
 *
 * The node:
 * 1. Extracts the query from the latest user message
 * 2. Builds metadata filters from topicDomain and detectedNgbIds
 * 3. Runs a narrow (filtered) search first, then broadens if needed
 * 4. Computes a retrievalConfidence score
 * 5. Returns retrievedDocuments and retrievalConfidence on state
 */
export function createRetrieverNode(vectorStore: VectorStoreLike) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const query = getLastUserMessage(state);

    if (!query) {
      log.warn("Retriever received empty query");
      return { retrievedDocuments: [], retrievalConfidence: 0 };
    }

    try {
      // --- Phase 1: Narrow (filtered) search ---
      const filter = buildFilter(state);
      let results: Array<
        [{ pageContent: string; metadata: Record<string, unknown> }, number]
      > = [];

      if (filter) {
        log.info("Running narrow retrieval", {
          filter,
          topK: RETRIEVAL_CONFIG.narrowFilterTopK,
        });
        results = await vectorStore.similaritySearchWithScore(
          query,
          RETRIEVAL_CONFIG.narrowFilterTopK,
          filter,
        );
      }

      // --- Phase 2: Broaden if narrow search yields too few results ---
      if (results.length < 2) {
        log.info("Broadening retrieval (narrow returned insufficient results)", {
          narrowCount: results.length,
          topK: RETRIEVAL_CONFIG.broadenFilterTopK,
        });
        const broadResults = await vectorStore.similaritySearchWithScore(
          query,
          RETRIEVAL_CONFIG.broadenFilterTopK,
        );

        // Merge, deduplicating by content
        const seen = new Set(results.map(([doc]) => doc.pageContent));
        for (const result of broadResults) {
          if (!seen.has(result[0].pageContent)) {
            results.push(result);
            seen.add(result[0].pageContent);
          }
        }
      }

      // --- Phase 3: Score and rank ---
      // Sort by score ascending (lower distance = better match for cosine)
      results.sort((a, b) => a[1] - b[1]);

      // Limit to configured topK
      const topResults = results.slice(0, RETRIEVAL_CONFIG.topK);

      const scores = topResults.map(([, score]) => score);
      const confidence = computeConfidence(scores);

      // --- Phase 4: Map to RetrievedDocument[] ---
      const retrievedDocuments: RetrievedDocument[] = topResults.map(
        ([doc, score]) => ({
          content: doc.pageContent,
          metadata: {
            ngbId: doc.metadata.ngbId as string | undefined,
            topicDomain: doc.metadata.topicDomain as
              | RetrievedDocument["metadata"]["topicDomain"]
              | undefined,
            documentType: doc.metadata.documentType as string | undefined,
            sourceUrl: doc.metadata.sourceUrl as string | undefined,
            documentTitle: doc.metadata.documentTitle as string | undefined,
            sectionTitle: doc.metadata.sectionTitle as string | undefined,
            effectiveDate: doc.metadata.effectiveDate as string | undefined,
            ingestedAt: doc.metadata.ingestedAt as string | undefined,
          },
          score,
        }),
      );

      log.info("Retrieval complete", {
        documentCount: retrievedDocuments.length,
        confidence: confidence.toFixed(3),
        topScore: scores[0]?.toFixed(3) ?? "N/A",
      });

      return {
        retrievedDocuments,
        retrievalConfidence: confidence,
      };
    } catch (error) {
      log.error("Retrieval failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { retrievedDocuments: [], retrievalConfidence: 0 };
    }
  };
}
