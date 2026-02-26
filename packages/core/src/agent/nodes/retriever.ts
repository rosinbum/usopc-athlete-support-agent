import type { Pool } from "pg";
import { logger, AUTHORITY_LEVELS, type AuthorityLevel } from "@usopc/shared";
import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { RETRIEVAL_CONFIG } from "../../config/index.js";
import { vectorStoreSearch } from "../../services/vectorStoreService.js";
import {
  buildContextualQuery,
  stateContext,
  deduplicateChunks,
} from "../../utils/index.js";
import { bm25Search } from "../../rag/bm25Search.js";
import { rrfFuse } from "../../rag/rrfFuse.js";
import type { RrfCandidate } from "../../rag/rrfFuse.js";
import type { AgentState } from "../state.js";
import type {
  RetrievedDocument,
  SubQuery,
  QueryIntent,
} from "../../types/index.js";

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

/** Standard RRF smoothing constant. */
const RRF_K = 60;

/**
 * Maps queryIntent to the vector weight (alpha) for RRF fusion.
 * Text weight = 1 - alpha.
 */
const INTENT_VECTOR_WEIGHTS: Record<QueryIntent, number> = {
  factual: 0.4,
  procedural: 0.4,
  deadline: 0.3,
  escalation: 0.5,
  general: 0.7,
};

const DEFAULT_VECTOR_WEIGHT = 0.5;

/**
 * Maps queryIntent to an authority boost multiplier.
 * Legal/rights queries heavily favor authoritative sources;
 * general/operational queries favor semantic relevance instead.
 */
const INTENT_AUTHORITY_MULTIPLIERS: Record<QueryIntent, number> = {
  factual: 0.7,
  procedural: 0.7,
  deadline: 0.5,
  escalation: 1.0,
  general: 0.3,
};

const DEFAULT_AUTHORITY_MULTIPLIER = 0.5;

/**
 * Maximum authority boost added to an RRF score for the highest-authority
 * document (law/statute, index 0 in AUTHORITY_LEVELS).
 *
 * Calibrated against the typical RRF score range (~0.008–0.016): a max
 * boost of 0.003 is meaningful (~20–40% of a typical score) without
 * swamping semantic relevance. Tune this constant if the corpus or RRF
 * parameters change significantly.
 */
const MAX_AUTHORITY_BOOST = 0.003;

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
 * Builds a metadata filter object for PGVectorStore (JSONB-based).
 */
function buildFilter(state: AgentState): Record<string, unknown> | undefined {
  const conditions: Record<string, unknown> = {};

  if (state.detectedNgbIds.length > 0) {
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
 * Builds a SQL filter for BM25 search using denormalized columns.
 */
function buildSqlFilter(state: AgentState): {
  ngbIds?: string[];
  topicDomain?: string;
} {
  const filter: { ngbIds?: string[]; topicDomain?: string } = {};

  if (state.detectedNgbIds.length > 0) {
    filter.ngbIds = state.detectedNgbIds;
  }

  if (state.topicDomain) {
    filter.topicDomain = state.topicDomain;
  }

  return filter;
}

/**
 * Builds a SQL filter from a sub-query's domain and NGB IDs.
 */
function buildSubQuerySqlFilter(subQuery: SubQuery): {
  ngbIds?: string[];
  topicDomain?: string;
} {
  const filter: { ngbIds?: string[]; topicDomain?: string } = {};

  if (subQuery.ngbIds.length > 0) {
    filter.ngbIds = subQuery.ngbIds;
  }

  filter.topicDomain = subQuery.domain;

  return filter;
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
 * Higher authority levels get a larger boost.
 *
 * For hybrid search (RRF), the boost is **added** to the RRF score
 * (higher = better). See MAX_AUTHORITY_BOOST for calibration rationale.
 */
function computeAuthorityBoost(
  authorityLevel: string | undefined,
  queryIntent: QueryIntent | undefined,
): number {
  if (!authorityLevel) return 0;

  const index = AUTHORITY_LEVELS.indexOf(authorityLevel as AuthorityLevel);
  if (index === -1) return 0;

  // Higher index = lower authority = less boost
  // Range: MAX_AUTHORITY_BOOST (law, index 0) to 0 (educational_guidance, last index)
  const maxBoost = MAX_AUTHORITY_BOOST;
  const baseBoost = maxBoost * (1 - index / (AUTHORITY_LEVELS.length - 1));
  const multiplier = queryIntent
    ? (INTENT_AUTHORITY_MULTIPLIERS[queryIntent] ??
      DEFAULT_AUTHORITY_MULTIPLIER)
    : DEFAULT_AUTHORITY_MULTIPLIER;
  return baseBoost * multiplier;
}

/**
 * Computes a retrieval confidence score from cosine distance scores.
 *
 * Used for vector-only paths (e.g. retrieval expander recomputing confidence).
 */
export function computeConfidence(scores: number[]): number {
  if (scores.length === 0) return 0;

  const bestScore = scores[0]!;
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  const normalizedBest = Math.max(0, Math.min(1, 1 - bestScore));
  const normalizedAvg = Math.max(0, Math.min(1, 1 - avgScore));

  return normalizedBest * 0.6 + normalizedAvg * 0.4;
}

/**
 * Computes confidence from RRF fused scores.
 *
 * Normalizes against the theoretical maximum RRF score (rank 1 in both
 * lists with weights summing to 1): 1 / (rrfK + 1).
 */
export function computeHybridConfidence(
  rrfScores: number[],
  rrfK: number,
): number {
  if (rrfScores.length === 0) return 0;

  const maxScore = 1 / (rrfK + 1);
  const bestScore = rrfScores[0]!;
  const avgScore = rrfScores.reduce((a, b) => a + b, 0) / rrfScores.length;

  const normalizedBest = Math.min(1, bestScore / maxScore);
  const normalizedAvg = Math.min(1, avgScore / maxScore);

  return normalizedBest * 0.6 + normalizedAvg * 0.4;
}

function getVectorWeight(queryIntent: QueryIntent | undefined): number {
  if (!queryIntent) return DEFAULT_VECTOR_WEIGHT;
  return INTENT_VECTOR_WEIGHTS[queryIntent] ?? DEFAULT_VECTOR_WEIGHT;
}

/**
 * Runs hybrid search (vector + BM25) and fuses results via RRF.
 * Returns fused candidates sorted by score descending.
 */
async function runHybridSearch(
  vectorStore: VectorStoreLike,
  pool: Pool,
  query: string,
  vectorK: number,
  vectorFilter: Record<string, unknown> | undefined,
  sqlFilter: { ngbIds?: string[]; topicDomain?: string },
  vectorWeight: number,
  resultK: number,
): Promise<RrfCandidate[]> {
  // Run vector and text search in parallel
  const [vectorResults, textResults] = await Promise.all([
    vectorStoreSearch(
      () => vectorStore.similaritySearchWithScore(query, vectorK, vectorFilter),
      [],
    ),
    vectorStoreSearch(
      () => bm25Search(pool, { query, k: vectorK * 2, filter: sqlFilter }),
      [],
    ),
  ]);

  // Map vector results to RRF input format
  const vectorMapped = vectorResults.map(([doc, score]) => ({
    id: (doc.metadata.id as string) ?? doc.pageContent.slice(0, 64),
    content: doc.pageContent,
    metadata: doc.metadata,
    score,
  }));

  return rrfFuse(vectorMapped, textResults, {
    k: resultK,
    rrfK: RRF_K,
    vectorWeight,
  });
}

/**
 * Factory function that creates a RETRIEVER node bound to a specific
 * vector store and database pool.
 *
 * The node:
 * 1. Extracts the query from the latest user message
 * 2. Builds metadata filters from topicDomain and detectedNgbIds
 * 3. Runs hybrid search (vector + BM25) and fuses via RRF
 * 4. Falls back to broadened search if narrow results are insufficient
 * 5. Applies authority boost and computes retrievalConfidence
 * 6. Returns retrievedDocuments and retrievalConfidence on state
 */
export function createRetrieverNode(vectorStore: VectorStoreLike, pool: Pool) {
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
      sqlFilter: { ngbIds?: string[]; topicDomain?: string };
      vectorWeight: number;
    }): Promise<{
      results: RrfCandidate[];
      resultCount: number;
      topScore: number | null;
    }> => {
      let results: RrfCandidate[] = [];
      if (input.filter) {
        log.info("Running narrow hybrid retrieval", {
          filter: input.filter,
          topK: RETRIEVAL_CONFIG.narrowFilterTopK,
        });
        results = await runHybridSearch(
          vectorStore,
          pool,
          input.query,
          RETRIEVAL_CONFIG.narrowFilterTopK,
          input.filter,
          input.sqlFilter,
          input.vectorWeight,
          RETRIEVAL_CONFIG.topK,
        );
      }
      return {
        results,
        resultCount: results.length,
        topScore: results.length > 0 ? results[0]!.score : null,
      };
    },
  }).withConfig({ runName: "retriever:narrow_search" });

  const broadSearchSpan = new RunnableLambda({
    func: async (input: {
      query: string;
      narrowResults: RrfCandidate[];
      state: AgentState;
      vectorWeight: number;
    }): Promise<{
      results: RrfCandidate[];
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

        // For broadened search, relax SQL filters too (drop topicDomain)
        const broadSqlFilter: { ngbIds?: string[]; topicDomain?: string } = {};
        if (input.state.detectedNgbIds.length > 0) {
          broadSqlFilter.ngbIds = input.state.detectedNgbIds;
        }

        const broadResults = await runHybridSearch(
          vectorStore,
          pool,
          input.query,
          RETRIEVAL_CONFIG.broadenFilterTopK,
          broadFilter,
          broadSqlFilter,
          input.vectorWeight,
          RETRIEVAL_CONFIG.topK,
        );

        // Merge, deduplicating by content
        const seen = new Set(results.map((c) => c.content));
        for (const result of broadResults) {
          if (!seen.has(result.content)) {
            results.push(result);
            seen.add(result.content);
          }
        }
      }
      return { results, broadened, finalCount: results.length };
    },
  }).withConfig({ runName: "retriever:broad_search" });

  /**
   * Applies authority boost and computes confidence from RRF candidates.
   */
  function scoreAndRank(
    candidates: RrfCandidate[],
    queryIntent: QueryIntent | undefined,
  ): {
    topResults: RrfCandidate[];
    confidence: number;
  } {
    // Apply authority boost (additive — higher RRF score = better)
    const boosted = candidates.map((c) => ({
      ...c,
      score:
        c.score +
        computeAuthorityBoost(
          c.metadata.authorityLevel as string | undefined,
          queryIntent,
        ),
    }));

    // Re-sort by boosted score descending
    boosted.sort((a, b) => b.score - a.score);

    const topResults = boosted.slice(0, RETRIEVAL_CONFIG.topK);
    const scores = topResults.map((c) => c.score);
    const confidence = computeHybridConfidence(scores, RRF_K);

    return { topResults, confidence };
  }

  /**
   * Maps RRF candidates to RetrievedDocument format.
   */
  function mapToRetrievedDocuments(
    candidates: RrfCandidate[],
  ): RetrievedDocument[] {
    return candidates.map((c) => ({
      content: c.content,
      metadata: {
        ngbId: c.metadata.ngbId as string | undefined,
        topicDomain: c.metadata.topicDomain as
          | RetrievedDocument["metadata"]["topicDomain"]
          | undefined,
        documentType: c.metadata.documentType as string | undefined,
        sourceUrl: c.metadata.sourceUrl as string | undefined,
        documentTitle: c.metadata.documentTitle as string | undefined,
        sectionTitle: c.metadata.sectionTitle as string | undefined,
        effectiveDate: c.metadata.effectiveDate as string | undefined,
        ingestedAt: c.metadata.ingestedAt as string | undefined,
        authorityLevel: c.metadata.authorityLevel as AuthorityLevel | undefined,
      },
      score: c.score,
    }));
  }

  return async (
    state: AgentState,
    config?: RunnableConfig,
  ): Promise<Partial<AgentState>> => {
    const vectorWeight = getVectorWeight(state.queryIntent);

    // Sub-query retrieval: run parallel hybrid searches per sub-query
    if (state.subQueries && state.subQueries.length > 0) {
      try {
        log.info("Running sub-query hybrid retrieval", {
          subQueryCount: state.subQueries.length,
          domains: state.subQueries.map((sq) => sq.domain),
          vectorWeight,
          ...stateContext(state),
        });

        const subQueryResults = await Promise.all(
          state.subQueries.map(async (subQuery) => {
            const filter = buildSubQueryFilter(subQuery);
            const sqlFilter = buildSubQuerySqlFilter(subQuery);
            const sqVectorWeight = getVectorWeight(
              subQuery.intent as QueryIntent | undefined,
            );
            return runHybridSearch(
              vectorStore,
              pool,
              subQuery.query,
              RETRIEVAL_CONFIG.narrowFilterTopK,
              filter,
              sqlFilter,
              sqVectorWeight,
              RETRIEVAL_CONFIG.topK,
            );
          }),
        );

        // Merge and deduplicate by content
        const seen = new Set<string>();
        const mergedResults: RrfCandidate[] = [];
        for (const results of subQueryResults) {
          for (const result of results) {
            if (!seen.has(result.content)) {
              seen.add(result.content);
              mergedResults.push(result);
            }
          }
        }

        const { topResults, confidence } = scoreAndRank(
          mergedResults,
          state.queryIntent,
        );
        const mapped = mapToRetrievedDocuments(topResults);
        const retrievedDocuments = deduplicateChunks(mapped);
        if (mapped.length !== retrievedDocuments.length) {
          log.info("Near-duplicate chunks deduplicated", {
            before: mapped.length,
            after: retrievedDocuments.length,
            removed: mapped.length - retrievedDocuments.length,
          });
        }

        log.info("Sub-query hybrid retrieval complete", {
          documentCount: retrievedDocuments.length,
          confidence: confidence.toFixed(3),
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

    // Standard single-domain hybrid retrieval
    const { query } = await buildQuerySpan.invoke({ state }, config);

    if (!query) {
      log.warn("Retriever received empty query");
      return { retrievedDocuments: [], retrievalConfidence: 0 };
    }

    try {
      const filter = buildFilter(state);
      const sqlFilter = buildSqlFilter(state);

      const { results: narrowResults } = await narrowSearchSpan.invoke(
        { query, filter, sqlFilter, vectorWeight },
        config,
      );

      const { results } = await broadSearchSpan.invoke(
        { query, narrowResults, state, vectorWeight },
        config,
      );

      const { topResults, confidence } = scoreAndRank(
        results,
        state.queryIntent,
      );
      const mapped = mapToRetrievedDocuments(topResults);
      const retrievedDocuments = deduplicateChunks(mapped);
      if (mapped.length !== retrievedDocuments.length) {
        log.info("Near-duplicate chunks deduplicated", {
          before: mapped.length,
          after: retrievedDocuments.length,
          removed: mapped.length - retrievedDocuments.length,
        });
      }

      log.info("Hybrid retrieval complete", {
        documentCount: retrievedDocuments.length,
        confidence: confidence.toFixed(3),
        vectorWeight,
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
