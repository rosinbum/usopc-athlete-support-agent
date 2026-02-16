import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logger } from "@usopc/shared";
import { getModelConfig } from "../../config/index.js";
import {
  invokeAnthropic,
  extractTextFromResponse,
} from "../../services/anthropicService.js";
import { vectorStoreSearch } from "../../services/vectorStoreService.js";
import { buildContextualQuery, stateContext } from "../../utils/index.js";
import { buildRetrievalExpanderPrompt } from "../../prompts/index.js";
import { computeConfidence } from "./retriever.js";
import type { VectorStoreLike } from "./retriever.js";
import type { AgentState } from "../state.js";
import type { RetrievedDocument } from "../../types/index.js";

const log = logger.child({ service: "retrieval-expander-node" });

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
 * Factory function that creates a RETRIEVAL EXPANDER node.
 *
 * When retrieval confidence is low, this node reformulates the original
 * query using Haiku, runs parallel searches with reformulated queries,
 * merges results with existing documents (deduplicating by content),
 * and recomputes confidence.
 *
 * Fail-open: If the Haiku call or searches fail, returns
 * `{ expansionAttempted: true }` so the graph falls through to the
 * researcher node on the next routing decision.
 */
export function createRetrievalExpanderNode(vectorStore: VectorStoreLike) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const { currentMessage } = buildContextualQuery(state.messages);

    if (!currentMessage) {
      log.warn("Retrieval expander received empty query");
      return { expansionAttempted: true };
    }

    try {
      const config = await getModelConfig();
      const model = new ChatAnthropic({
        model: config.classifier.model,
        temperature: config.classifier.temperature,
        maxTokens: config.classifier.maxTokens,
      });

      const existingDocTitles = state.retrievedDocuments
        .map((d) => d.metadata.documentTitle)
        .filter((t): t is string => !!t);

      const prompt = buildRetrievalExpanderPrompt(
        currentMessage,
        state.topicDomain,
        existingDocTitles,
      );

      const response = await invokeAnthropic(model, [
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

      // Run parallel searches for each reformulated query
      const filter = buildFilter(state);
      const searchPromises = reformulatedQueries.map((query) =>
        vectorStoreSearch(
          () => vectorStore.similaritySearchWithScore(query, 5, filter),
          [],
        ),
      );

      const searchResults = await Promise.all(searchPromises);

      // Merge with existing documents, deduplicating by content
      const seen = new Set(state.retrievedDocuments.map((d) => d.content));
      const newDocs: RetrievedDocument[] = [];

      for (const results of searchResults) {
        for (const [doc, score] of results) {
          if (!seen.has(doc.pageContent)) {
            seen.add(doc.pageContent);
            newDocs.push({
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
                  | RetrievedDocument["metadata"]["authorityLevel"]
                  | undefined,
              },
              score,
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
