import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenAIEmbeddings } from "@langchain/openai";
import type { Pool } from "pg";

const { mockInitialize } = vi.hoisted(() => ({
  mockInitialize: vi.fn(),
}));

const { mockGetPool } = vi.hoisted(() => ({
  mockGetPool: vi.fn(),
}));

vi.mock("@langchain/community/vectorstores/pgvector", () => ({
  PGVectorStore: {
    initialize: mockInitialize,
  },
}));

vi.mock("@usopc/shared", () => ({
  getPool: mockGetPool,
}));

import { createVectorStore } from "./vectorStore.js";

describe("createVectorStore", () => {
  let mockEmbeddings: OpenAIEmbeddings;
  let mockPool: Pool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddings = {} as OpenAIEmbeddings;
    mockPool = { query: vi.fn() } as unknown as Pool;
    mockGetPool.mockReturnValue(mockPool);
    mockInitialize.mockResolvedValue({ similaritySearch: vi.fn() });
  });

  describe("initialization", () => {
    it("should call PGVectorStore.initialize with embeddings", async () => {
      await createVectorStore(mockEmbeddings);

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.any(Object),
      );
    });

    it("should return initialized vector store", async () => {
      const mockStore = { similaritySearch: vi.fn() };
      mockInitialize.mockResolvedValue(mockStore);

      const result = await createVectorStore(mockEmbeddings);

      expect(result).toBe(mockStore);
    });
  });

  describe("pool", () => {
    it("should use the shared pool from getPool() by default", async () => {
      await createVectorStore(mockEmbeddings);

      expect(mockGetPool).toHaveBeenCalled();
      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          pool: mockPool,
        }),
      );
    });

    it("should use a custom pool when provided", async () => {
      const customPool = { query: vi.fn() } as unknown as Pool;

      await createVectorStore(mockEmbeddings, { pool: customPool });

      expect(mockGetPool).not.toHaveBeenCalled();
      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          pool: customPool,
        }),
      );
    });

    it("should not pass postgresConnectionOptions", async () => {
      await createVectorStore(mockEmbeddings);

      const callArgs = mockInitialize.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty("postgresConnectionOptions");
    });
  });

  describe("default configuration", () => {
    it("should use default table name", async () => {
      await createVectorStore(mockEmbeddings);

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          tableName: "document_chunks",
        }),
      );
    });

    it("should use default column names", async () => {
      await createVectorStore(mockEmbeddings);

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          columns: {
            idColumnName: "id",
            vectorColumnName: "embedding",
            contentColumnName: "content",
            metadataColumnName: "metadata",
          },
        }),
      );
    });
  });

  describe("custom configuration", () => {
    it("should allow custom table name", async () => {
      await createVectorStore(mockEmbeddings, {
        tableName: "custom_embeddings",
      });

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          tableName: "custom_embeddings",
        }),
      );
    });

    it("should allow custom column names", async () => {
      await createVectorStore(mockEmbeddings, {
        columns: {
          idColumnName: "custom_id",
          vectorColumnName: "custom_vector",
          contentColumnName: "custom_content",
          metadataColumnName: "custom_meta",
        },
      });

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          columns: {
            idColumnName: "custom_id",
            vectorColumnName: "custom_vector",
            contentColumnName: "custom_content",
            metadataColumnName: "custom_meta",
          },
        }),
      );
    });

    it("should merge partial column config with defaults", async () => {
      await createVectorStore(mockEmbeddings, {
        columns: {
          vectorColumnName: "my_embedding",
        },
      });

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          columns: {
            vectorColumnName: "my_embedding",
          },
        }),
      );
    });
  });

  describe("error handling", () => {
    it("should propagate initialization errors", async () => {
      mockInitialize.mockRejectedValue(new Error("Connection failed"));

      await expect(createVectorStore(mockEmbeddings)).rejects.toThrow(
        "Connection failed",
      );
    });
  });
});
