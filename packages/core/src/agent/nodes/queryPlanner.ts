import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import { logger, CircuitBreakerError, TOPIC_DOMAINS } from "@usopc/shared";
import { buildQueryPlannerPrompt } from "../../prompts/index.js";
import {
  invokeLlm,
  extractTextFromResponse,
} from "../../services/llmService.js";
import {
  getLastUserMessage,
  stateContext,
  parseLlmJson,
} from "../../utils/index.js";
import type { AgentState } from "../state.js";
import type { TopicDomain, QueryIntent, SubQuery } from "../../types/index.js";

const log = logger.child({ service: "query-planner-node" });

const MAX_SUB_QUERIES = 4;

const VALID_DOMAINS: readonly string[] = TOPIC_DOMAINS;

const VALID_INTENTS: QueryIntent[] = [
  "factual",
  "procedural",
  "deadline",
  "escalation",
  "general",
];

interface QueryPlannerOutput {
  isComplex: boolean;
  subQueries: SubQuery[];
}

interface ParseResult {
  output: QueryPlannerOutput;
  warnings: string[];
}

/**
 * Parses the JSON response from the query planner model.
 * Returns a safe default (not complex) if parsing fails.
 */
export function parseQueryPlannerResponse(raw: string): ParseResult {
  const warnings: string[] = [];

  const parsed = parseLlmJson(raw);

  const isComplex =
    typeof parsed.isComplex === "boolean" ? parsed.isComplex : false;

  if (!isComplex) {
    return { output: { isComplex: false, subQueries: [] }, warnings };
  }

  const rawSubQueries = Array.isArray(parsed.subQueries)
    ? parsed.subQueries
    : [];

  const validSubQueries: SubQuery[] = [];

  for (const sq of rawSubQueries.slice(0, MAX_SUB_QUERIES)) {
    const item = sq as Record<string, unknown>;

    if (typeof item.query !== "string" || !item.query.trim()) {
      warnings.push("Skipped sub-query with missing/empty query");
      continue;
    }

    let domain: TopicDomain;
    if (VALID_DOMAINS.includes(item.domain as TopicDomain)) {
      domain = item.domain as TopicDomain;
    } else {
      warnings.push(`Invalid sub-query domain: "${String(item.domain)}"`);
      continue;
    }

    let intent: QueryIntent = "general";
    if (VALID_INTENTS.includes(item.intent as QueryIntent)) {
      intent = item.intent as QueryIntent;
    } else if (item.intent !== undefined) {
      warnings.push(`Invalid sub-query intent: "${String(item.intent)}"`);
    }

    const ngbIds = Array.isArray(item.ngbIds)
      ? (item.ngbIds as unknown[]).filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [];

    validSubQueries.push({ query: item.query.trim(), domain, intent, ngbIds });
  }

  if (validSubQueries.length < 2) {
    warnings.push(
      `Complex query flagged but only ${validSubQueries.length} valid sub-queries; treating as simple`,
    );
    return { output: { isComplex: false, subQueries: [] }, warnings };
  }

  return { output: { isComplex: true, subQueries: validSubQueries }, warnings };
}

/**
 * QUERY PLANNER node.
 *
 * Analyzes the classifier output and determines whether the user's question
 * spans multiple governance domains. If so, decomposes it into targeted
 * sub-queries for the retriever to search independently.
 *
 * Simple queries pass through unchanged (isComplexQuery: false).
 * Errors fail open — the pipeline continues with normal single-domain retrieval.
 */
export function createQueryPlannerNode(model: BaseChatModel) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const userMessage = getLastUserMessage(state.messages);

    if (!userMessage) {
      log.warn("Query planner received empty user message; passing through");
      return { isComplexQuery: false, subQueries: [] };
    }

    const prompt = buildQueryPlannerPrompt(
      userMessage,
      state.topicDomain,
      state.queryIntent,
    );

    try {
      const response = await invokeLlm(model, [new HumanMessage(prompt)]);
      const responseText = extractTextFromResponse(response);
      const { output: result, warnings } =
        parseQueryPlannerResponse(responseText);

      if (warnings.length > 0) {
        log.warn("Query planner response had issues", {
          warnings,
          ...stateContext(state),
        });
      }

      log.info("Query planning complete", {
        isComplex: result.isComplex,
        subQueryCount: result.subQueries.length,
        domains: result.subQueries.map((sq) => sq.domain),
        ...stateContext(state),
      });

      return {
        isComplexQuery: result.isComplex,
        subQueries: result.subQueries,
      };
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        log.warn("Query planner circuit open; passing through", {
          ...stateContext(state),
        });
      } else {
        log.error("Query planner failed; passing through", {
          error: error instanceof Error ? error.message : String(error),
          ...stateContext(state),
        });
      }

      return { isComplexQuery: false, subQueries: [] };
    }
  };
}
