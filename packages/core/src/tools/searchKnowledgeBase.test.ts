import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSearchKnowledgeBaseTool } from "./searchKnowledgeBase.js";
import type { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import type { Document } from "@langchain/core/documents";

describe("createSearchKnowledgeBaseTool", () => {
  let mockVectorStore: {
    similaritySearchWithScore: ReturnType<typeof vi.fn>;
  };
  let tool: ReturnType<typeof createSearchKnowledgeBaseTool>;

  const createMockDocument = (
    content: string,
    metadata: Record<string, unknown> = {},
  ): Document => ({
    pageContent: content,
    metadata,
  });

  beforeEach(() => {
    mockVectorStore = {
      similaritySearchWithScore: vi.fn(),
    };
    tool = createSearchKnowledgeBaseTool(
      mockVectorStore as unknown as PGVectorStore,
    );
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("search_knowledge_base");
    });

    it("should have a description mentioning key topics", () => {
      expect(tool.description).toContain("USOPC");
      expect(tool.description).toContain("team selection");
      expect(tool.description).toContain("SafeSport");
      expect(tool.description).toContain("anti-doping");
    });
  });

  describe("basic search", () => {
    it("should call vector store with query and default topK", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [
          createMockDocument("Test content", {
            documentTitle: "Test Doc",
            ngbId: "usa-swimming",
          }),
          0.85,
        ],
      ]);

      await tool.invoke({ query: "team selection process" });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "team selection process",
        expect.any(Number),
        undefined,
      );
    });

    it("should format results with scores", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [
          createMockDocument("Content about selection criteria", {
            documentTitle: "Selection Procedures",
            sectionTitle: "Criteria",
            ngbId: "usa-swimming",
            topicDomain: "team_selection",
            sourceUrl: "https://example.com/doc",
            effectiveDate: "2024-01-01",
          }),
          0.876,
        ],
      ]);

      const result = await tool.invoke({ query: "selection criteria" });

      expect(result).toContain("Result 1 (score: 0.876)");
      expect(result).toContain("Document: Selection Procedures");
      expect(result).toContain("Section: Criteria");
      expect(result).toContain("NGB: usa-swimming");
      expect(result).toContain("Topic: team_selection");
      expect(result).toContain("Source: https://example.com/doc");
      expect(result).toContain("Effective Date: 2024-01-01");
      expect(result).toContain("Content about selection criteria");
    });
  });

  describe("filtering by NGB", () => {
    it("should apply NGB filter when ngbIds provided", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      await tool.invoke({
        query: "eligibility requirements",
        ngbIds: ["usa-swimming", "us-rowing"],
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "eligibility requirements",
        expect.any(Number),
        { ngbId: { $in: ["usa-swimming", "us-rowing"] } },
      );
    });

    it("should use narrower topK when filter is applied", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      await tool.invoke({
        query: "team selection",
        ngbIds: ["usa-swimming"],
      });

      // With filter, should use narrowFilterTopK (typically 5)
      const calls = mockVectorStore.similaritySearchWithScore.mock.calls;
      expect(calls[0][1]).toBeLessThanOrEqual(10);
    });
  });

  describe("filtering by topic domain", () => {
    it("should apply topic domain filter", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      await tool.invoke({
        query: "how to file a complaint",
        topicDomain: "safesport",
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "how to file a complaint",
        expect.any(Number),
        { topicDomain: "safesport" },
      );
    });
  });

  describe("combined filters", () => {
    it("should apply both NGB and topic domain filters", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      await tool.invoke({
        query: "anti-doping rules",
        ngbIds: ["usa-track-field"],
        topicDomain: "anti_doping",
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "anti-doping rules",
        expect.any(Number),
        {
          ngbId: { $in: ["usa-track-field"] },
          topicDomain: "anti_doping",
        },
      );
    });
  });

  describe("custom topK", () => {
    it("should respect custom topK parameter", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      await tool.invoke({
        query: "governance policies",
        topK: 10,
        ngbIds: ["usopc"],
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "governance policies",
        10,
        expect.any(Object),
      );
    });
  });

  describe("multiple results", () => {
    it("should format multiple results with separators", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [
          createMockDocument("First document content", {
            documentTitle: "Doc 1",
          }),
          0.9,
        ],
        [
          createMockDocument("Second document content", {
            documentTitle: "Doc 2",
          }),
          0.8,
        ],
        [
          createMockDocument("Third document content", {
            documentTitle: "Doc 3",
          }),
          0.7,
        ],
      ]);

      const result = await tool.invoke({ query: "test query" });

      expect(result).toContain("Result 1 (score: 0.900)");
      expect(result).toContain("Result 2 (score: 0.800)");
      expect(result).toContain("Result 3 (score: 0.700)");
      expect(result).toContain("Doc 1");
      expect(result).toContain("Doc 2");
      expect(result).toContain("Doc 3");
    });
  });

  describe("no results", () => {
    it("should return helpful message when no results found", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      const result = await tool.invoke({ query: "obscure topic" });

      expect(result).toContain("No relevant documents found");
      expect(result).toContain("Try rephrasing or broadening");
    });
  });

  describe("error handling", () => {
    it("should handle vector store errors gracefully", async () => {
      mockVectorStore.similaritySearchWithScore.mockRejectedValue(
        new Error("Database connection failed"),
      );

      const result = await tool.invoke({ query: "test query" });

      expect(result).toContain("Knowledge base search encountered an error");
      expect(result).toContain("Database connection failed");
    });

    it("should handle non-Error exceptions", async () => {
      mockVectorStore.similaritySearchWithScore.mockRejectedValue(
        "String error",
      );

      const result = await tool.invoke({ query: "test query" });

      expect(result).toContain("Knowledge base search encountered an error");
      expect(result).toContain("String error");
    });
  });

  describe("metadata handling", () => {
    it("should handle missing optional metadata fields", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [createMockDocument("Content only", {}), 0.75],
      ]);

      const result = await tool.invoke({ query: "test" });

      expect(result).toContain("Result 1 (score: 0.750)");
      expect(result).toContain("Content only");
      expect(result).not.toContain("Document:");
      expect(result).not.toContain("Section:");
      expect(result).not.toContain("NGB:");
    });

    it("should include all available metadata fields", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [
          createMockDocument("Full metadata content", {
            documentTitle: "Full Doc",
            sectionTitle: "Section A",
            ngbId: "test_ngb",
            topicDomain: "eligibility",
            sourceUrl: "https://test.com",
            effectiveDate: "2025-01-01",
          }),
          0.95,
        ],
      ]);

      const result = await tool.invoke({ query: "test" });

      expect(result).toContain("Document: Full Doc");
      expect(result).toContain("Section: Section A");
      expect(result).toContain("NGB: test_ngb");
      expect(result).toContain("Topic: eligibility");
      expect(result).toContain("Source: https://test.com");
      expect(result).toContain("Effective Date: 2025-01-01");
    });
  });

  describe("empty ngbIds array", () => {
    it("should not apply NGB filter for empty array", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      await tool.invoke({
        query: "test",
        ngbIds: [],
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "test",
        expect.any(Number),
        undefined,
      );
    });
  });
});
