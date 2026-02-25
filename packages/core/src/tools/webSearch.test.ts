import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInvoke, mockTavilySearch } = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockTavilySearch = vi.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  }));
  return { mockInvoke, mockTavilySearch };
});

vi.mock("@langchain/tavily", () => ({
  TavilySearch: mockTavilySearch,
}));

vi.mock("../config/index.js", () => ({
  TRUSTED_DOMAINS: [
    "usopc.org",
    "usaswimming.org",
    "usada.org",
    "safesport.org",
  ],
}));

import { createWebSearchTool } from "./webSearch.js";

describe("createWebSearchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      const tool = createWebSearchTool();
      expect(tool.name).toBe("web_search");
    });

    it("should have a description mentioning official sources", () => {
      const tool = createWebSearchTool();
      expect(tool.description).toContain("USOPC");
      expect(tool.description).toContain("NGB");
      expect(tool.description).toContain("USADA");
      expect(tool.description).toContain("SafeSport");
    });
  });

  describe("basic search", () => {
    it("should invoke Tavily with query", async () => {
      mockInvoke.mockResolvedValue({
        results: [{ title: "Test", url: "https://usopc.org/test" }],
      });
      const tool = createWebSearchTool();

      await tool.invoke({ query: "team selection criteria" });

      expect(mockInvoke).toHaveBeenCalledWith({
        query: "team selection criteria",
      });
    });

    it("should return search results as JSON string", async () => {
      const searchResults = {
        results: [
          {
            title: "Selection Procedures",
            url: "https://usopc.org/selection",
            content: "Details...",
          },
        ],
      };
      mockInvoke.mockResolvedValue(searchResults);
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "selection procedures" });

      expect(result).toContain("Selection Procedures");
      expect(result).toContain("https://usopc.org/selection");
    });

    it("should handle string response from Tavily", async () => {
      mockInvoke.mockResolvedValue("Plain text response from search");
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test query" });

      expect(result).toBe("Plain text response from search");
    });
  });

  describe("domain enforcement", () => {
    it("schema does not expose a domains parameter", () => {
      const tool = createWebSearchTool();
      const schema = tool.schema as { shape?: Record<string, unknown> };
      expect(schema.shape).not.toHaveProperty("domains");
    });

    it("always uses TRUSTED_DOMAINS for API call regardless of query", async () => {
      mockInvoke.mockResolvedValue({ results: [] });

      const tool = createWebSearchTool();
      await tool.invoke({ query: "search example.com for anything" });

      expect(mockTavilySearch).toHaveBeenCalledWith(
        expect.objectContaining({
          includeDomains: [
            "usopc.org",
            "usaswimming.org",
            "usada.org",
            "safesport.org",
          ],
        }),
      );
    });

    it("filters out structured results with untrusted URLs", async () => {
      mockInvoke.mockResolvedValue({
        results: [
          { title: "Malicious", url: "https://malicious.com/hack" },
          { title: "Also Bad", url: "https://evil.org/steal" },
        ],
      });
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });

      expect(result).toContain(
        "No results found from trusted USOPC/NGB sources",
      );
    });

    it("passes through structured results with trusted URLs", async () => {
      mockInvoke.mockResolvedValue({
        results: [
          { title: "USOPC Rules", url: "https://usopc.org/rules" },
          { title: "USADA Policy", url: "https://usada.org/policy" },
        ],
      });
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });

      expect(result).toContain("USOPC Rules");
      expect(result).toContain("USADA Policy");
    });

    it("filters mixed results to only trusted ones", async () => {
      mockInvoke.mockResolvedValue({
        results: [
          { title: "Trusted", url: "https://usopc.org/page" },
          { title: "Untrusted", url: "https://attacker.com/page" },
          { title: "Also Trusted", url: "https://sub.safesport.org/page" },
        ],
      });
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });
      const parsed = JSON.parse(result);

      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0].title).toBe("Trusted");
      expect(parsed.results[1].title).toBe("Also Trusted");
    });

    it("returns no-trusted-results message when all results are untrusted", async () => {
      mockInvoke.mockResolvedValue({
        results: [
          { title: "Bad1", url: "https://evil.com/a" },
          { title: "Bad2", url: "https://hacker.io/b" },
        ],
      });
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });

      expect(result).toBe(
        "No results found from trusted USOPC/NGB sources. Try a different query.",
      );
    });

    it("filters out results with invalid URLs", async () => {
      mockInvoke.mockResolvedValue({
        results: [
          { title: "Invalid URL", url: "not-a-valid-url" },
          { title: "Good", url: "https://usopc.org/good" },
        ],
      });
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });
      const parsed = JSON.parse(result);

      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].title).toBe("Good");
    });
  });

  describe("configuration options", () => {
    it("should use default maxResults of 5", async () => {
      mockInvoke.mockResolvedValue({ results: [] });

      const tool = createWebSearchTool();
      await tool.invoke({ query: "test" });

      expect(mockTavilySearch).toHaveBeenCalledWith(
        expect.objectContaining({
          maxResults: 5,
        }),
      );
    });

    it("should respect custom maxResults option", async () => {
      mockInvoke.mockResolvedValue({ results: [] });

      const tool = createWebSearchTool({ maxResults: 10 });
      await tool.invoke({ query: "test" });

      expect(mockTavilySearch).toHaveBeenCalledWith(
        expect.objectContaining({
          maxResults: 10,
        }),
      );
    });

    it("should pass API key to Tavily when provided", async () => {
      mockInvoke.mockResolvedValue({ results: [] });

      const tool = createWebSearchTool({ apiKey: "test-api-key" });
      await tool.invoke({ query: "test" });

      expect(mockTavilySearch).toHaveBeenCalledWith(
        expect.objectContaining({
          tavilyApiKey: "test-api-key",
        }),
      );
    });
  });

  describe("no results", () => {
    it("should return helpful message for null response", async () => {
      mockInvoke.mockResolvedValue(null);
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "very specific query" });

      expect(result).toContain("No web search results found");
      expect(result).toContain("Try broadening your search");
    });

    it("should return helpful message for empty string response", async () => {
      mockInvoke.mockResolvedValue("   ");
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "specific query" });

      expect(result).toContain("No web search results found");
    });
  });

  describe("error handling", () => {
    it("should handle Tavily errors gracefully with sanitized message", async () => {
      mockInvoke.mockRejectedValue(new Error("API rate limit exceeded"));
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });

      expect(result).toBe(
        "Web search encountered a temporary error. The knowledge base may still have the information you need.",
      );
      expect(result).not.toContain("API rate limit exceeded");
    });

    it("should handle non-Error exceptions with sanitized message", async () => {
      mockInvoke.mockRejectedValue("Network timeout");
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });

      expect(result).toBe(
        "Web search encountered a temporary error. The knowledge base may still have the information you need.",
      );
      expect(result).not.toContain("Network timeout");
    });
  });

  describe("result formatting", () => {
    it("should pretty-print JSON results", async () => {
      mockInvoke.mockResolvedValue({
        results: [{ title: "Test", url: "https://usopc.org/test" }],
      });
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });

      // Should be formatted JSON with indentation
      expect(result).toContain('"results"');
      expect(result).toContain('"title"');
    });
  });
});
