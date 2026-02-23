import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { TavilySearch } from "@langchain/tavily";
import { logger, CircuitBreakerError } from "@usopc/shared";
import { TRUSTED_DOMAINS } from "../../config/index.js";
import {
  invokeLlm,
  extractTextFromResponse,
} from "../../services/llmService.js";
import { searchWithTavily } from "../../services/tavilyService.js";
import {
  buildContextualQuery,
  getLastUserMessage,
  parseLlmJson,
  stateContext,
} from "../../utils/index.js";
import { buildResearcherPrompt } from "../../prompts/index.js";
import type { AgentState } from "../state.js";
import type { WebSearchResult } from "../../types/index.js";

const log = logger.child({ service: "researcher-node" });

/**
 * Maximum number of search results to return to the synthesizer.
 */
const MAX_SEARCH_RESULTS = 5;

/**
 * Minimal interface for the Tavily search tool dependency.
 *
 * Allows injection of a real TavilySearch instance or a test double.
 */
export interface TavilySearchLike {
  invoke(input: string | { query: string }): Promise<unknown>;
}

/**
 * Builds a search query from the user message and classification context.
 * Prepends relevant domain keywords to improve search quality.
 *
 * Used as fallback when there is no conversation context or the LLM call fails.
 */
function buildSearchQuery(state: AgentState, userMessage: string): string {
  const parts: string[] = [];

  // Add domain context
  if (state.topicDomain) {
    const domainLabels: Record<string, string> = {
      team_selection: "USOPC team selection qualifying standards procedures",
      dispute_resolution: "USOPC athlete dispute resolution arbitration",
      safesport: "SafeSport policy reporting",
      anti_doping: "USADA anti-doping testing",
      eligibility: "athlete eligibility requirements",
      governance: "USOPC NGB governance",
      athlete_rights: "athlete rights representation USOPC",
      athlete_safety: "athlete safety wellness protections",
      financial_assistance: "athlete financial assistance grants funding",
    };
    const label = domainLabels[state.topicDomain];
    if (label) {
      parts.push(label);
    }
  }

  // Add the user message itself
  parts.push(userMessage);

  return parts.join(" ");
}

/**
 * Parses a JSON array of search query strings from the model response.
 * Uses {@link parseLlmJson} for length-guarded parsing with markdown
 * fence stripping. Returns an empty array if parsing fails.
 */
function parseSearchQueries(text: string): string[] {
  try {
    const parsed = parseLlmJson<unknown>(text);
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
 * Generates 1-3 targeted web search queries using an LLM.
 *
 * When conversation context is available, the model analyzes prior messages
 * for current event references (named orgs, concrete actions, timeframes)
 * and generates event-specific queries alongside policy queries.
 *
 * Falls back to `buildSearchQuery()` when:
 * - There is no conversation context (first message in conversation)
 * - The LLM call fails
 * - The response cannot be parsed as a JSON array
 */
async function generateSearchQueries(
  model: BaseChatModel,
  state: AgentState,
): Promise<string[]> {
  const { currentMessage, conversationContext } = buildContextualQuery(
    state.messages,
    { maxTurns: 3 },
  );

  if (!currentMessage) {
    return [];
  }

  // No conversation context — skip LLM, use simple query builder
  if (!conversationContext) {
    return [buildSearchQuery(state, currentMessage)];
  }

  try {
    const prompt = buildResearcherPrompt(
      currentMessage,
      conversationContext,
      state.topicDomain,
    );

    const response = await invokeLlm(model, [
      new SystemMessage(
        "You are a web search query generator. Respond with only a JSON array of strings.",
      ),
      new HumanMessage(prompt),
    ]);

    const responseText = extractTextFromResponse(response);
    const queries = parseSearchQueries(responseText);

    if (queries.length === 0) {
      log.warn("Failed to parse search queries from LLM", {
        responseText: responseText.slice(0, 200),
        ...stateContext(state),
      });
      return [buildSearchQuery(state, currentMessage)];
    }

    log.info("Generated context-aware search queries", {
      count: queries.length,
      queries,
      ...stateContext(state),
    });

    return queries;
  } catch (error) {
    log.warn("LLM query generation failed, falling back to simple query", {
      error: error instanceof Error ? error.message : String(error),
      ...stateContext(state),
    });
    return [buildSearchQuery(state, currentMessage)];
  }
}

/**
 * Extracts structured WebSearchResult entries from a Tavily response.
 * Returns an empty array if the response is not in the expected format.
 */
function extractStructuredResults(rawResult: unknown): WebSearchResult[] {
  if (
    rawResult != null &&
    typeof rawResult === "object" &&
    "results" in rawResult &&
    Array.isArray((rawResult as Record<string, unknown>).results)
  ) {
    const results = (rawResult as Record<string, unknown>).results as Array<
      Record<string, unknown>
    >;
    return results
      .filter(
        (r) =>
          typeof r.url === "string" &&
          typeof r.title === "string" &&
          typeof r.content === "string",
      )
      .map((r) => ({
        url: r.url as string,
        title: r.title as string,
        content: r.content as string,
        score: typeof r.score === "number" ? (r.score as number) : 0,
      }));
  }
  return [];
}

/**
 * Factory function that creates a RESEARCHER node bound to a specific
 * Tavily search instance and LLM model.
 *
 * The node:
 * 1. Generates 1-3 search queries (LLM-based when conversation context exists)
 * 2. Runs parallel Tavily web searches scoped to trusted domains
 * 3. Deduplicates results by URL, sorted by score descending
 * 4. Returns structured results as webSearchResults + webSearchResultUrls
 *
 * This node is only invoked when retrieval confidence is below the
 * threshold, providing a fallback information source.
 */
export function createResearcherNode(
  tavilySearch: TavilySearchLike,
  model: BaseChatModel,
) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const userMessage = getLastUserMessage(state.messages);

    if (!userMessage) {
      log.warn("Researcher received empty user message");
      return { webSearchResults: [], webSearchResultUrls: [] };
    }

    try {
      // Generate targeted search queries (1-3)
      const queries = await generateSearchQueries(model, state);

      if (queries.length === 0) {
        log.warn("No search queries generated");
        return { webSearchResults: [], webSearchResultUrls: [] };
      }

      log.info("Running web searches", {
        queryCount: queries.length,
        queries: queries.map((q) => q.slice(0, 200)),
        trustedDomains: TRUSTED_DOMAINS,
      });

      // Execute searches in parallel, preserving partial results on failure
      const settled = await Promise.allSettled(
        queries.map((q) => searchWithTavily(tavilySearch, q)),
      );

      const rawResults: unknown[] = [];
      for (const outcome of settled) {
        if (outcome.status === "fulfilled") {
          rawResults.push(outcome.value);
        } else {
          log.warn("One search query failed", {
            error:
              outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason),
          });
        }
      }

      // Collect all structured results and deduplicate by URL
      const seenUrls = new Set<string>();
      const allStructured: WebSearchResult[] = [];

      for (const rawResult of rawResults) {
        for (const result of extractStructuredResults(rawResult)) {
          if (!seenUrls.has(result.url)) {
            seenUrls.add(result.url);
            allStructured.push(result);
          }
        }
      }

      // Sort by score descending
      allStructured.sort((a, b) => b.score - a.score);

      // Build text results for the synthesizer
      let searchResults: string[];
      if (allStructured.length > 0) {
        searchResults = allStructured
          .map((r) => r.content)
          .slice(0, MAX_SEARCH_RESULTS);
      } else {
        // Fallback: parse first raw result as text (legacy format)
        const rawResult = rawResults[0];
        const resultText =
          typeof rawResult === "string"
            ? rawResult
            : JSON.stringify(rawResult, null, 2);

        searchResults =
          resultText.length > 0
            ? resultText
                .split(/\n{2,}/)
                .map((r) => r.trim())
                .filter((r) => r.length > 0)
                .slice(0, MAX_SEARCH_RESULTS)
            : [];
      }

      log.info("Web search complete", {
        resultCount: searchResults.length,
        structuredUrlCount: allStructured.length,
        queryCount: queries.length,
      });

      return {
        webSearchResults: searchResults,
        webSearchResultUrls: allStructured.slice(0, MAX_SEARCH_RESULTS),
      };
    } catch (error) {
      const isCircuitOpen = error instanceof CircuitBreakerError;
      if (isCircuitOpen) {
        log.warn("Researcher circuit open; returning empty results", {
          isCircuitOpen,
          ...stateContext(state),
        });
      } else {
        log.error("Web search failed", {
          error: error instanceof Error ? error.message : String(error),
          ...stateContext(state),
        });
      }

      // Graceful degradation: the synthesizer can still work with
      // whatever documents were retrieved earlier.
      return { webSearchResults: [], webSearchResultUrls: [] };
    }
  };
}

/**
 * Creates a pre-configured TavilySearch instance scoped to trusted domains.
 *
 * This is a convenience helper; callers can also construct their own
 * TavilySearch and pass it to `createResearcherNode` directly.
 */
export function createTavilySearchTool(tavilyApiKey: string): TavilySearch {
  return new TavilySearch({
    tavilyApiKey,
    maxResults: MAX_SEARCH_RESULTS,
    includeDomains: [...TRUSTED_DOMAINS],
  });
}
