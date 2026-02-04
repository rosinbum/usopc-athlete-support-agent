import { TavilySearch } from "@langchain/tavily";
import { logger } from "@usopc/shared";
import { TRUSTED_DOMAINS } from "../../config/index.js";
import { searchWithTavily } from "../../services/tavilyService.js";
import type { AgentState } from "../state.js";

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
 * Factory function that creates a RESEARCHER node bound to a specific
 * Tavily search instance.
 *
 * The node:
 * 1. Builds a search query from the user message + domain context
 * 2. Runs the Tavily web search scoped to trusted domains
 * 3. Parses and returns the results as webSearchResults on state
 *
 * This node is only invoked when retrieval confidence is below the
 * threshold, providing a fallback information source.
 */
export function createResearcherNode(tavilySearch: TavilySearchLike) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const userMessage = getLastUserMessage(state);

    if (!userMessage) {
      log.warn("Researcher received empty user message");
      return { webSearchResults: [] };
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

      // The Tavily tool may return a string or structured result.
      // Normalize to string then parse into individual result strings.
      const resultText =
        typeof rawResult === "string"
          ? rawResult
          : JSON.stringify(rawResult, null, 2);

      let searchResults: string[] = [];

      if (resultText.length > 0) {
        // Tavily returns structured text; split into logical results
        // Each result is typically separated by double newlines.
        searchResults = resultText
          .split(/\n{2,}/)
          .map((r) => r.trim())
          .filter((r) => r.length > 0)
          .slice(0, MAX_SEARCH_RESULTS);
      }

      log.info("Web search complete", {
        resultCount: searchResults.length,
      });

      return {
        webSearchResults: searchResults,
      };
    } catch (error) {
      log.error("Web search failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Graceful degradation: the synthesizer can still work with
      // whatever documents were retrieved earlier.
      return { webSearchResults: [] };
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
