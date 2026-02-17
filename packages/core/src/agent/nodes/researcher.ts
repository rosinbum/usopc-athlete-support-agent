import { TavilySearch } from "@langchain/tavily";
import { logger, CircuitBreakerError } from "@usopc/shared";
import { TRUSTED_DOMAINS } from "../../config/index.js";
import { searchWithTavily } from "../../services/tavilyService.js";
import { getLastUserMessage, stateContext } from "../../utils/index.js";
import type { AgentState } from "../state.js";
import type { WebSearchResult } from "../../types/index.js";

const log = logger.child({ service: "researcher-node" });

/**
 * Maximum number of search results to request from Tavily.
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
 */
function buildSearchQuery(state: AgentState, userMessage: string): string {
  const parts: string[] = [];

  // Add domain context
  if (state.topicDomain) {
    const domainLabels: Record<string, string> = {
      team_selection: "USOPC team selection procedures",
      dispute_resolution: "USOPC athlete dispute resolution arbitration",
      safesport: "SafeSport policy reporting",
      anti_doping: "USADA anti-doping testing",
      eligibility: "athlete eligibility requirements",
      governance: "USOPC NGB governance",
      athlete_rights: "athlete rights representation USOPC",
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
 * Tavily search instance.
 *
 * The node:
 * 1. Builds a search query from the user message + domain context
 * 2. Runs the Tavily web search scoped to trusted domains
 * 3. Parses and returns the results as webSearchResults on state
 * 4. Extracts structured URL results for the source discovery pipeline
 *
 * This node is only invoked when retrieval confidence is below the
 * threshold, providing a fallback information source.
 */
export function createResearcherNode(tavilySearch: TavilySearchLike) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const userMessage = getLastUserMessage(state.messages);

    if (!userMessage) {
      log.warn("Researcher received empty user message");
      return { webSearchResults: [], webSearchResultUrls: [] };
    }

    const query = buildSearchQuery(state, userMessage);

    try {
      log.info("Running web search", {
        query: query.slice(0, 200),
        trustedDomains: TRUSTED_DOMAINS,
      });

      // Tavily's invoke returns search results (string or object).
      // We scope the search to trusted USOPC-related domains.
      // The call is protected by a circuit breaker for resilience.
      const rawResult = await searchWithTavily(tavilySearch, query);

      // Extract structured results (url, title, content) when available
      const structuredResults = extractStructuredResults(rawResult);

      // Build text results for the synthesizer (preserving existing behavior)
      let searchResults: string[];
      if (structuredResults.length > 0) {
        searchResults = structuredResults
          .map((r) => r.content)
          .slice(0, MAX_SEARCH_RESULTS);
      } else {
        // Fallback: parse raw result as text
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
        structuredUrlCount: structuredResults.length,
      });

      return {
        webSearchResults: searchResults,
        webSearchResultUrls: structuredResults.slice(0, MAX_SEARCH_RESULTS),
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
