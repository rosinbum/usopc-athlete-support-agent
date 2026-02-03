import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieve } from "./retriever.js";
import type { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import type { Document } from "@langchain/core/documents";

describe("retrieve", () => {
  let mockVectorStore: {
    similaritySearchWithScore: ReturnType<typeof vi.fn>;
  };

  const createDoc = (
    id: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Document => ({
    pageContent: content,
    metadata: { id, ...metadata },
  });

  beforeEach(() => {
    mockVectorStore = {
      similaritySearchWithScore: vi.fn(),
    };
  });

  describe("basic retrieval", () => {
    it("should return documents from vector store", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [createDoc("1", "Content 1"), 0.9],
        [createDoc("2", "Content 2"), 0.8],
      ]);

      const result = await retrieve(
        mockVectorStore as unknown as PGVectorStore,
        "test query",
      );

      expect(result.documents).toHaveLength(2);
      expect(result.documents[0].pageContent).toBe("Content 1");
      expect(result.documents[1].pageContent).toBe("Content 2");
    });

    it("should calculate confidence from average score", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [createDoc("1", "Doc 1"), 0.9],
        [createDoc("2", "Doc 2"), 0.7],
      ]);

      const result = await retrieve(
        mockVectorStore as unknown as PGVectorStore,
        "query",
      );

      expect(result.confidence).toBe(0.8); // (0.9 + 0.7) / 2
    });

    it("should use default topK of 10", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      await retrieve(mockVectorStore as unknown as PGVectorStore, "query");

      // Without filters, should search with topK (capped at 5 for narrow)
      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "query",
        5,
        undefined,
      );
    });
  });

  describe("NGB filtering", () => {
    it("should apply NGB filter when ngbIds provided", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [createDoc("1", "Doc 1"), 0.8],
      ]);

      await retrieve(mockVectorStore as unknown as PGVectorStore, "query", {
        ngbIds: ["usa_swimming", "us_rowing"],
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "query",
        5,
        { ngb_id: { $in: ["usa_swimming", "us_rowing"] } },
      );
    });

    it("should not apply NGB filter for empty array", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      await retrieve(mockVectorStore as unknown as PGVectorStore, "query", {
        ngbIds: [],
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "query",
        5,
        undefined,
      );
    });
  });

  describe("topic domain filtering", () => {
    it("should apply topic domain filter", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [createDoc("1", "Doc 1"), 0.85],
      ]);

      await retrieve(mockVectorStore as unknown as PGVectorStore, "query", {
        topicDomain: "team_selection",
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "query",
        5,
        { topic_domain: "team_selection" },
      );
    });
  });

  describe("combined filters", () => {
    it("should apply both NGB and topic filters", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [createDoc("1", "Doc 1"), 0.9],
      ]);

      await retrieve(mockVectorStore as unknown as PGVectorStore, "query", {
        ngbIds: ["usa_swimming"],
        topicDomain: "eligibility",
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "query",
        5,
        {
          ngb_id: { $in: ["usa_swimming"] },
          topic_domain: "eligibility",
        },
      );
    });
  });

  describe("two-stage retrieval (broadening)", () => {
    it("should broaden search when confidence is below threshold", async () => {
      // First call (narrow) returns low confidence results
      mockVectorStore.similaritySearchWithScore
        .mockResolvedValueOnce([
          [createDoc("1", "Narrow result"), 0.3], // Low score
        ])
        // Second call (broad) returns better results
        .mockResolvedValueOnce([
          [createDoc("2", "Broad result"), 0.7],
          [createDoc("3", "Another broad"), 0.6],
        ]);

      const result = await retrieve(
        mockVectorStore as unknown as PGVectorStore,
        "query",
        { ngbIds: ["usa_swimming"], confidenceThreshold: 0.5 },
      );

      // Should have called twice - narrow then broad
      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledTimes(
        2,
      );
      // Broad search should remove NGB filter
      expect(
        mockVectorStore.similaritySearchWithScore.mock.calls[1][2],
      ).toEqual(undefined);
    });

    it("should keep topic filter when broadening", async () => {
      mockVectorStore.similaritySearchWithScore
        .mockResolvedValueOnce([[createDoc("1", "Low conf"), 0.2]])
        .mockResolvedValueOnce([[createDoc("2", "Broad"), 0.8]]);

      await retrieve(mockVectorStore as unknown as PGVectorStore, "query", {
        ngbIds: ["usa_swimming"],
        topicDomain: "safesport",
        confidenceThreshold: 0.5,
      });

      // Second call should have only topic filter
      expect(
        mockVectorStore.similaritySearchWithScore.mock.calls[1][2],
      ).toEqual({ topic_domain: "safesport" });
    });

    it("should merge narrow and broad results with deduplication", async () => {
      mockVectorStore.similaritySearchWithScore
        .mockResolvedValueOnce([[createDoc("1", "Narrow doc"), 0.4]])
        .mockResolvedValueOnce([
          [createDoc("1", "Same doc (duplicate)"), 0.45], // Same ID
          [createDoc("2", "New broad doc"), 0.7],
        ]);

      const result = await retrieve(
        mockVectorStore as unknown as PGVectorStore,
        "query",
        { ngbIds: ["test"], confidenceThreshold: 0.5 },
      );

      // Should deduplicate by ID
      expect(result.documents).toHaveLength(2);
      const ids = result.documents.map((d) => d.metadata.id);
      expect(ids).toContain("1");
      expect(ids).toContain("2");
    });

    it("should sort merged results by score descending", async () => {
      mockVectorStore.similaritySearchWithScore
        .mockResolvedValueOnce([[createDoc("1", "Low narrow"), 0.3]])
        .mockResolvedValueOnce([
          [createDoc("2", "High broad"), 0.9],
          [createDoc("3", "Medium broad"), 0.5],
        ]);

      const result = await retrieve(
        mockVectorStore as unknown as PGVectorStore,
        "query",
        { ngbIds: ["test"], confidenceThreshold: 0.5 },
      );

      // Should be sorted by score
      expect(result.documents[0].metadata.id).toBe("2"); // 0.9
      expect(result.documents[1].metadata.id).toBe("3"); // 0.5
      expect(result.documents[2].metadata.id).toBe("1"); // 0.3
    });

    it("should not broaden when confidence is above threshold", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [createDoc("1", "High conf"), 0.9],
      ]);

      await retrieve(mockVectorStore as unknown as PGVectorStore, "query", {
        ngbIds: ["usa_swimming"],
        confidenceThreshold: 0.5,
      });

      // Should only call once
      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledTimes(
        1,
      );
    });

    it("should not broaden when no filters were applied", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([
        [createDoc("1", "Low conf"), 0.3],
      ]);

      await retrieve(mockVectorStore as unknown as PGVectorStore, "query", {
        confidenceThreshold: 0.5,
      });

      // No filters means nothing to broaden
      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe("custom options", () => {
    it("should respect custom topK", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      await retrieve(mockVectorStore as unknown as PGVectorStore, "query", {
        topK: 20,
        ngbIds: ["test"], // Need filter to trigger narrow search with topK cap
      });

      // Narrow search is capped at min(topK, 5) = 5
      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
        "query",
        5,
        expect.any(Object),
      );
    });

    it("should respect custom confidence threshold", async () => {
      mockVectorStore.similaritySearchWithScore
        .mockResolvedValueOnce([[createDoc("1", "Medium conf"), 0.6]])
        .mockResolvedValueOnce([[createDoc("2", "Broad"), 0.8]]);

      // With high threshold, 0.6 should trigger broadening
      await retrieve(mockVectorStore as unknown as PGVectorStore, "query", {
        ngbIds: ["test"],
        confidenceThreshold: 0.7,
      });

      expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledTimes(
        2,
      );
    });
  });

  describe("empty results", () => {
    it("should return empty documents and zero confidence for no results", async () => {
      mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

      const result = await retrieve(
        mockVectorStore as unknown as PGVectorStore,
        "query",
      );

      expect(result.documents).toEqual([]);
      expect(result.confidence).toBe(0);
    });
  });

  describe("topK limiting after merge", () => {
    it("should limit merged results to topK", async () => {
      // Create many results
      const narrowResults = [
        [createDoc("1", "Narrow 1"), 0.3],
        [createDoc("2", "Narrow 2"), 0.25],
      ] as [Document, number][];

      const broadResults = Array.from({ length: 15 }, (_, i) => [
        createDoc(`broad-${i}`, `Broad ${i}`),
        0.8 - i * 0.05,
      ]) as [Document, number][];

      mockVectorStore.similaritySearchWithScore
        .mockResolvedValueOnce(narrowResults)
        .mockResolvedValueOnce(broadResults);

      const result = await retrieve(
        mockVectorStore as unknown as PGVectorStore,
        "query",
        { ngbIds: ["test"], topK: 10, confidenceThreshold: 0.5 },
      );

      // Should be limited to exactly topK=10
      expect(result.documents.length).toBe(10);
    });
  });
});
