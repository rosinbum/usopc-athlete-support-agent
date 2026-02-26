import type { Pool } from "pg";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logger } from "@usopc/shared";
import {
  invokeLlm,
  extractTextFromResponse,
} from "../../services/llmService.js";
import { vectorStoreSearch } from "../../services/vectorStoreService.js";
import { buildContextualQuery, stateContext } from "../../utils/index.js";
import { buildRetrievalExpanderPrompt } from "../../prompts/index.js";
import { bm25Search } from "../../rag/bm25Search.js";
import { rrfFuse } from "../../rag/rrfFuse.js";
import { computeConfidence } from "./retriever.js";
import type { VectorStoreLike } from "./retriever.js";
import type { AgentState } from "../state.js";
import type { RetrievedDocument } from "../../types/index.js";

const log = logger.child({ service: "retrieval-expander-node" });

/** Standard RRF smoothing constant. */
const RRF_K = 60;

/**
 * Parses the JSON array of reformulated queries from the model response.
 * Returns an empty array if parsing fails.
 */
function parseReformulatedQueries(text: string): string[] {
  try {
    const parsed = JSON.parse(text.trim());
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Builds a metadata filter from the agent state, matching the retriever's
 * filter strategy.
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
 * Builds a SQL filter from the agent state for BM25 search.
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
 * Factory function that creates a RETRIEVAL EXPANDER node.
 *
 * When retrieval confidence is low, this node reformulates the original
 * query using Haiku, runs parallel hybrid searches (vector + BM25) with
 * reformulated queries, merges results with existing documents
 * (deduplicating by content), and recomputes confidence.
 *
 * Fail-open: If the Haiku call or searches fail, returns
 * `{ expansionAttempted: true }` so the graph falls through to the
 * researcher node on the next routing decision.
 */
export function createRetrievalExpanderNode(
  vectorStore: VectorStoreLike,
  model: BaseChatModel,
  pool: Pool,
) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const { currentMessage } = buildContextualQuery(state.messages);

    if (!currentMessage) {
      log.warn("Retrieval expander received empty query");
      return { expansionAttempted: true };
    }

    try {
      const existingDocTitles = state.retrievedDocuments
        .map((d) => d.metadata.documentTitle)
        .filter((t): t is string => !!t);

      const prompt = buildRetrievalExpanderPrompt(
        currentMessage,
        state.topicDomain,
        existingDocTitles,
      );

      const response = await invokeLlm(model, [
        new SystemMessage(
          "You are a search query reformulation assistant. Respond with only a JSON array.",
        ),
        new HumanMessage(prompt),
      ]);

      const responseText = extractTextFromResponse(response);
      const reformulatedQueries = parseReformulatedQueries(responseText);

      if (reformulatedQueries.length === 0) {
        log.warn("Failed to parse reformulated queries", {
          responseText: responseText.slice(0, 200),
          ...stateContext(state),
        });
        return { expansionAttempted: true, reformulatedQueries: [] };
      }

      log.info("Generated reformulated queries", {
        count: reformulatedQueries.length,
        queries: reformulatedQueries,
        ...stateContext(state),
      });

      // Run parallel hybrid searches for each reformulated query
      const filter = buildFilter(state);
      const sqlFilter = buildSqlFilter(state);

      const searchPromises = reformulatedQueries.map(async (query) => {
        const [vectorResults, textResults] = await Promise.all([
          vectorStoreSearch(
            () => vectorStore.similaritySearchWithScore(query, 5, filter),
            [],
          ),
          vectorStoreSearch(
            () => bm25Search(pool, { query, k: 10, filter: sqlFilter }),
            [],
          ),
        ]);

        // Map vector results to RRF input
        const vectorMapped = vectorResults.map(([doc, score]) => ({
          id: (doc.metadata.id as string) ?? doc.pageContent.slice(0, 64),
          content: doc.pageContent,
          metadata: doc.metadata,
          score,
        }));

        return rrfFuse(vectorMapped, textResults, {
          k: 5,
          rrfK: RRF_K,
          vectorWeight: 0.5,
        });
      });

      const searchResults = await Promise.all(searchPromises);

      // Merge with existing documents, deduplicating by content
      const seen = new Set(state.retrievedDocuments.map((d) => d.content));
      const newDocs: RetrievedDocument[] = [];

      for (const results of searchResults) {
        for (const candidate of results) {
          if (!seen.has(candidate.content)) {
            seen.add(candidate.content);
            newDocs.push({
              content: candidate.content,
              metadata: {
                ngbId: candidate.metadata.ngbId as string | undefined,
                topicDomain: candidate.metadata.topicDomain as
                  | RetrievedDocument["metadata"]["topicDomain"]
                  | undefined,
                documentType: candidate.metadata.documentType as
                  | string
                  | undefined,
                sourceUrl: candidate.metadata.sourceUrl as string | undefined,
                documentTitle: candidate.metadata.documentTitle as
                  | string
                  | undefined,
                sectionTitle: candidate.metadata.sectionTitle as
                  | string
                  | undefined,
                effectiveDate: candidate.metadata.effectiveDate as
                  | string
                  | undefined,
                ingestedAt: candidate.metadata.ingestedAt as string | undefined,
                authorityLevel: candidate.metadata.authorityLevel as
                  | RetrievedDocument["metadata"]["authorityLevel"]
                  | undefined,
              },
              score: candidate.score,
            });
          }
        }
      }

      const mergedDocs = [...state.retrievedDocuments, ...newDocs];
      const allScores = mergedDocs.map((d) => d.score);
      const newConfidence = computeConfidence(allScores);

      log.info("Retrieval expansion complete", {
        originalDocs: state.retrievedDocuments.length,
        newDocs: newDocs.length,
        mergedDocs: mergedDocs.length,
        originalConfidence: state.retrievalConfidence.toFixed(3),
        newConfidence: newConfidence.toFixed(3),
        ...stateContext(state),
      });

      return {
        retrievedDocuments: mergedDocs,
        retrievalConfidence: newConfidence,
        expansionAttempted: true,
        reformulatedQueries,
      };
    } catch (error) {
      log.error("Retrieval expansion failed (fail-open)", {
        error: error instanceof Error ? error.message : String(error),
        ...stateContext(state),
      });
      return { expansionAttempted: true };
    }
  };
}
