import { TavilySearch } from "@langchain/tavily";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TRUSTED_DOMAINS } from "../config/index.js";
import { logger } from "@usopc/shared";

const webSearchSchema = z.object({
  query: z
    .string()
    .describe(
      "The search query. Be specific and include relevant sport or organization names.",
    ),
  domains: z
    .array(z.string())
    .optional()
    .describe(
      "Optional list of domains to restrict the search to. Defaults to trusted USOPC/NGB/USADA domains.",
    ),
});

export interface WebSearchToolOptions {
  /**
   * Tavily API key. If omitted, the tool reads from the TAVILY_API_KEY
   * environment variable at invocation time.
   */
  apiKey?: string;
  /**
   * Maximum number of search results to return. Defaults to 5.
   */
  maxResults?: number;
}

/**
 * Factory that creates the web_search tool. Accepts optional configuration
 * so the Tavily API key and result limits can be injected at setup time.
 */
export function createWebSearchTool(options: WebSearchToolOptions = {}) {
  return tool(
    async ({ query, domains }): Promise<string> => {
      const log = logger.child({ tool: "web_search" });
      log.debug("Executing web search", { query, domains });

      try {
        const searchDomains =
          domains && domains.length > 0 ? domains : [...TRUSTED_DOMAINS];

        const maxResults = options.maxResults ?? 5;

        const tavilySearch = new TavilySearch({
          ...(options.apiKey !== undefined
            ? { tavilyApiKey: options.apiKey }
            : {}),
          maxResults,
          includeDomains: searchDomains,
        });

        const response = await tavilySearch.invoke({ query });

        if (!response) {
          return "No web search results found. The query may be too specific or the trusted domains may not have relevant content. Try broadening your search.";
        }

        log.debug("Web search completed successfully");

        // TavilySearch may return structured results or a string
        const result =
          typeof response === "string"
            ? response
            : JSON.stringify(response, null, 2);

        if (!result.trim()) {
          return "No web search results found. Try broadening your search.";
        }

        return result;
      } catch (error) {
        log.error("Web search failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return `Web search encountered an error: ${error instanceof Error ? error.message : String(error)}. The knowledge base may still have the information you need.`;
      }
    },
    {
      name: "web_search",
      description:
        "Search the web for current information from official USOPC, NGB, USADA, and SafeSport websites. Use when knowledge base doesn't have sufficient information or for time-sensitive updates.",
      schema: webSearchSchema,
    },
  );
}
