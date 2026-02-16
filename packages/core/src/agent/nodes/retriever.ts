import { logger, AUTHORITY_LEVELS, type AuthorityLevel } from "@usopc/shared";
import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { RETRIEVAL_CONFIG } from "../../config/index.js";
import { vectorStoreSearch } from "../../services/vectorStoreService.js";
import { buildContextualQuery, stateContext } from "../../utils/index.js";
import type { AgentState } from "../state.js";
import type { RetrievedDocument, SubQuery } from "../../types/index.js";

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
 * Maximum length for context portion of enriched query.
 */
const MAX_CONTEXT_LENGTH = 200;

/**
 * Extracts key terms from conversation context for query enrichment.
 * Keeps it concise to avoid diluting the search query.
 */
function extractContextTerms(conversationContext: string): string {
  if (!conversationContext) return "";

  // Truncate to keep query focused
  const truncated = conversationContext.slice(0, MAX_CONTEXT_LENGTH);

  // Extract just the key content, removing role prefixes
  const cleaned = truncated
    .replace(/^(User|Assistant):\s*/gim, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

/**
 * Builds an enriched search query using conversation context.
 * TODO: Consider dedicated query reformulation node (#37)
 */
function buildEnrichedQuery(state: AgentState): string {
  const { currentMessage, conversationContext } = buildContextualQuery(
    state.messages,
    { maxTurns: 2 }, // Keep context focused for retrieval
  );

  if (!currentMessage) return "";

  const contextTerms = extractContextTerms(conversationContext);

  if (!contextTerms) {
    return currentMessage;
  }

  // Combine current message with context for better retrieval
  return `${currentMessage.toLowerCase()} ${contextTerms.toLowerCase()}`;
}

/**
 * Builds a metadata filter object from the agent state.
 *
 * When NGB IDs and/or a topic domain are present, the filter narrows
 * the search to relevant document partitions. When neither is available,
 * returns `undefined` to perform an unfiltered search.
 */
function buildFilter(state: AgentState): Record<string, unknown> | undefined {
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
 * Builds a broadened filter that includes NGB-specific docs **or** universal
 * docs (ngbId is null). This prevents broadening from losing NGB context
 * entirely while still picking up cross-NGB content.
 */
function buildBroadFilter(
  state: AgentState,
): Record<string, unknown> | undefined {
  if (state.detectedNgbIds.length === 0) return undefined;

  const ngbCondition: Record<string, unknown> =
    state.detectedNgbIds.length === 1
      ? { ngbId: state.detectedNgbIds[0] }
      : { ngbId: { $in: state.detectedNgbIds } };

  return {
    $or: [ngbCondition, { ngbId: null }],
  };
}

/**
 * Builds a metadata filter from a sub-query's domain and NGB IDs.
 */
function buildSubQueryFilter(
  subQuery: SubQuery,
): Record<string, unknown> | undefined {
  const conditions: Record<string, unknown> = {};

  if (subQuery.ngbIds.length > 0) {
    conditions["ngbId"] =
      subQuery.ngbIds.length === 1
        ? subQuery.ngbIds[0]
        : { $in: subQuery.ngbIds };
  }

  conditions["topicDomain"] = subQuery.domain;

  return Object.keys(conditions).length > 0 ? conditions : undefined;
}

/**
 * Computes an authority boost for a document based on its authority level.
 * Higher authority levels get a larger boost (lower composite score).
 *
 * Returns a value between 0 (highest authority) and 0.3 (lowest/no authority).
 * This is subtracted from the similarity score, so lower = better.
 */
function computeAuthorityBoost(authorityLevel: string | undefined): number {
  if (!authorityLevel) {
    // No authority level = treated as lowest priority
    return 0;
  }

  const index = AUTHORITY_LEVELS.indexOf(authorityLevel as AuthorityLevel);
  if (index === -1) {
    // Unknown authority level = no boost
    return 0;
  }

  // Higher index = lower authority = less boost
  // Range: 0.3 (law, index 0) to 0 (educational_guidance, index 8)
  const maxBoost = 0.3;
  return maxBoost * (1 - index / (AUTHORITY_LEVELS.length - 1));
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

type SearchResult = [
  { pageContent: string; metadata: Record<string, unknown> },
  number,
];

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
  // Build traced RunnableLambda wrappers once per factory call
  const buildQuerySpan = new RunnableLambda({
    func: async (input: {
      state: AgentState;
    }): Promise<{
      query: string;
      messageCount: number;
      hasContext: boolean;
    }> => {
      const query = buildEnrichedQuery(input.state);
      return {
        query,
        messageCount: input.state.messages.length,
        hasContext:
          query.length >
          ((input.state.messages.at(-1)?.content as string) ?? "").length,
      };
    },
  }).withConfig({ runName: "retriever:build_query" });

  const narrowSearchSpan = new RunnableLambda({
    func: async (input: {
      query: string;
      filter: Record<string, unknown> | undefined;
    }): Promise<{
      results: SearchResult[];
      resultCount: number;
      topScore: number | null;
    }> => {
      let results: SearchResult[] = [];
      if (input.filter) {
        log.info("Running narrow retrieval", {
          filter: input.filter,
          topK: RETRIEVAL_CONFIG.narrowFilterTopK,
        });
        // Use circuit breaker with fallback to empty array
        results = await vectorStoreSearch(
          () =>
            vectorStore.similaritySearchWithScore(
              input.query,
              RETRIEVAL_CONFIG.narrowFilterTopK,
              input.filter,
            ),
          [],
        );
      }
      return {
        results,
        resultCount: results.length,
        topScore: results.length > 0 ? results[0][1] : null,
      };
    },
  }).withConfig({ runName: "retriever:narrow_search" });

  const broadSearchSpan = new RunnableLambda({
    func: async (input: {
      query: string;
      narrowResults: SearchResult[];
      state: AgentState;
    }): Promise<{
      results: SearchResult[];
      broadened: boolean;
      finalCount: number;
    }> => {
      let results = input.narrowResults;
      let broadened = false;
      if (results.length < 2) {
        broadened = true;
        log.info(
          "Broadening retrieval (narrow returned insufficient results)",
          {
            narrowCount: results.length,
            topK: RETRIEVAL_CONFIG.broadenFilterTopK,
          },
        );
        const broadFilter = buildBroadFilter(input.state);
        // Use circuit breaker with fallback to empty array
        const broadResults = await vectorStoreSearch(
          () =>
            vectorStore.similaritySearchWithScore(
              input.query,
              RETRIEVAL_CONFIG.broadenFilterTopK,
              broadFilter,
            ),
          [],
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
      return { results, broadened, finalCount: results.length };
    },
  }).withConfig({ runName: "retriever:broad_search" });

  const scoreAndRankSpan = new RunnableLambda({
    func: async (input: {
      results: SearchResult[];
    }): Promise<{
      topResults: SearchResult[];
      confidence: number;
      topScore: number | null;
      docsReturned: number;
    }> => {
      const { results } = input;
      // Sort by score ascending (lower distance = better match for cosine)
      results.sort((a, b) => a[1] - b[1]);

      // Compute composite score that factors in authority level
      // Lower composite score = higher rank
      const scoredResults = results.map((result) => {
        const [doc, similarityScore] = result;
        const authorityBoost = computeAuthorityBoost(
          doc.metadata.authorityLevel as string | undefined,
        );
        // Subtract authority boost (higher authority = larger boost = lower composite score)
        const compositeScore = similarityScore - authorityBoost;
        return { result, compositeScore };
      });

      // Re-sort by composite score
      scoredResults.sort((a, b) => a.compositeScore - b.compositeScore);

      // Limit to configured topK
      const topResults = scoredResults
        .slice(0, RETRIEVAL_CONFIG.topK)
        .map((s) => s.result);

      const scores = topResults.map(([, score]) => score);
      const confidence = computeConfidence(scores);

      return {
        topResults,
        confidence,
        topScore: scores[0] ?? null,
        docsReturned: topResults.length,
      };
    },
  }).withConfig({ runName: "retriever:score_and_rank" });

  /**
   * Maps raw search results to RetrievedDocument format.
   */
  function mapToRetrievedDocuments(
    results: SearchResult[],
  ): RetrievedDocument[] {
    return results.map(([doc, score]) => ({
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
        authorityLevel: doc.metadata.authorityLevel as
          | AuthorityLevel
          | undefined,
      },
      score,
    }));
  }

  return async (
    state: AgentState,
    config?: RunnableConfig,
  ): Promise<Partial<AgentState>> => {
    // Sub-query retrieval: run parallel searches per sub-query
    if (state.subQueries && state.subQueries.length > 0) {
      try {
        log.info("Running sub-query retrieval", {
          subQueryCount: state.subQueries.length,
          domains: state.subQueries.map((sq) => sq.domain),
          ...stateContext(state),
        });

        const subQueryResults = await Promise.all(
          state.subQueries.map(async (subQuery) => {
            const filter = buildSubQueryFilter(subQuery);
            return vectorStoreSearch(
              () =>
                vectorStore.similaritySearchWithScore(
                  subQuery.query,
                  RETRIEVAL_CONFIG.narrowFilterTopK,
                  filter,
                ),
              [],
            );
          }),
        );

        // Merge and deduplicate by content
        const seen = new Set<string>();
        const mergedResults: SearchResult[] = [];
        for (const results of subQueryResults) {
          for (const result of results) {
            if (!seen.has(result[0].pageContent)) {
              seen.add(result[0].pageContent);
              mergedResults.push(result);
            }
          }
        }

        const { topResults, confidence, topScore } =
          await scoreAndRankSpan.invoke({ results: mergedResults }, config);

        const retrievedDocuments = mapToRetrievedDocuments(topResults);

        log.info("Sub-query retrieval complete", {
          documentCount: retrievedDocuments.length,
          confidence: confidence.toFixed(3),
          topScore: topScore?.toFixed(3) ?? "N/A",
          ...stateContext(state),
        });

        return {
          retrievedDocuments,
          retrievalConfidence: confidence,
          retrievalStatus: "success" as const,
        };
      } catch (error) {
        log.error("Sub-query retrieval failed", {
          error: error instanceof Error ? error.message : String(error),
          ...stateContext(state),
        });
        return {
          retrievedDocuments: [],
          retrievalConfidence: 0,
          retrievalStatus: "error" as const,
        };
      }
    }

    // Standard single-domain retrieval
    const { query } = await buildQuerySpan.invoke({ state }, config);

    if (!query) {
      log.warn("Retriever received empty query");
      return { retrievedDocuments: [], retrievalConfidence: 0 };
    }

    try {
      const filter = buildFilter(state);

      const { results: narrowResults } = await narrowSearchSpan.invoke(
        { query, filter },
        config,
      );

      const { results } = await broadSearchSpan.invoke(
        { query, narrowResults, state },
        config,
      );

      const { topResults, confidence, topScore } =
        await scoreAndRankSpan.invoke({ results }, config);

      const retrievedDocuments = mapToRetrievedDocuments(topResults);

      log.info("Retrieval complete", {
        documentCount: retrievedDocuments.length,
        confidence: confidence.toFixed(3),
        topScore: topScore?.toFixed(3) ?? "N/A",
        ...stateContext(state),
      });

      return {
        retrievedDocuments,
        retrievalConfidence: confidence,
        retrievalStatus: "success" as const,
      };
    } catch (error) {
      log.error("Retrieval failed", {
        error: error instanceof Error ? error.message : String(error),
        ...stateContext(state),
      });
      return {
        retrievedDocuments: [],
        retrievalConfidence: 0,
        retrievalStatus: "error" as const,
      };
    }
  };
}
