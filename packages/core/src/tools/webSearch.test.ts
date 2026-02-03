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
        results: [{ title: "Test", url: "https://test.com" }],
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

  describe("domain filtering", () => {
    it("should use trusted domains by default", async () => {
      mockInvoke.mockResolvedValue({ results: [] });

      const tool = createWebSearchTool();
      await tool.invoke({ query: "test" });

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

    it("should use custom domains when provided", async () => {
      mockInvoke.mockResolvedValue({ results: [] });

      const tool = createWebSearchTool();
      await tool.invoke({
        query: "test",
        domains: ["custom-domain.com", "another.org"],
      });

      expect(mockTavilySearch).toHaveBeenCalledWith(
        expect.objectContaining({
          includeDomains: ["custom-domain.com", "another.org"],
        }),
      );
    });

    it("should use trusted domains for empty domains array", async () => {
      mockInvoke.mockResolvedValue({ results: [] });

      const tool = createWebSearchTool();
      await tool.invoke({ query: "test", domains: [] });

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
    it("should handle Tavily errors gracefully", async () => {
      mockInvoke.mockRejectedValue(new Error("API rate limit exceeded"));
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });

      expect(result).toContain("Web search encountered an error");
      expect(result).toContain("API rate limit exceeded");
      expect(result).toContain("knowledge base may still have the information");
    });

    it("should handle non-Error exceptions", async () => {
      mockInvoke.mockRejectedValue("Network timeout");
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });

      expect(result).toContain("Web search encountered an error");
      expect(result).toContain("Network timeout");
    });
  });

  describe("result formatting", () => {
    it("should pretty-print JSON results", async () => {
      mockInvoke.mockResolvedValue({
        results: [{ title: "Test", url: "https://test.com" }],
      });
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: "test" });

      // Should be formatted JSON with indentation
      expect(result).toContain('"results"');
      expect(result).toContain('"title"');
    });
  });
});
