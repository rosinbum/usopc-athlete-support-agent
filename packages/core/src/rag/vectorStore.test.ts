import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenAIEmbeddings } from "@langchain/openai";

const { mockInitialize } = vi.hoisted(() => ({
  mockInitialize: vi.fn(),
}));

vi.mock("@langchain/community/vectorstores/pgvector", () => ({
  PGVectorStore: {
    initialize: mockInitialize,
  },
}));

import { createVectorStore } from "./vectorStore.js";

describe("createVectorStore", () => {
  let mockEmbeddings: OpenAIEmbeddings;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
    mockEmbeddings = {} as OpenAIEmbeddings;
    mockInitialize.mockResolvedValue({ similaritySearch: vi.fn() });
  });

  describe("initialization", () => {
    it("should call PGVectorStore.initialize with embeddings", async () => {
      await createVectorStore(mockEmbeddings, {
        connectionString: "postgresql://test",
      });

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.any(Object),
      );
    });

    it("should return initialized vector store", async () => {
      const mockStore = { similaritySearch: vi.fn() };
      mockInitialize.mockResolvedValue(mockStore);

      const result = await createVectorStore(mockEmbeddings, {
        connectionString: "postgresql://test",
      });

      expect(result).toBe(mockStore);
    });
  });

  describe("connection string", () => {
    it("should use provided connection string", async () => {
      await createVectorStore(mockEmbeddings, {
        connectionString: "postgresql://custom:5432/db",
      });

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          postgresConnectionOptions: expect.objectContaining({
            connectionString: "postgresql://custom:5432/db",
          }),
        }),
      );
    });

    it("should fall back to DATABASE_URL environment variable", async () => {
      process.env.DATABASE_URL = "postgresql://env:5432/envdb";

      await createVectorStore(mockEmbeddings);

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          postgresConnectionOptions: expect.objectContaining({
            connectionString: "postgresql://env:5432/envdb",
          }),
        }),
      );
    });

    it("should throw error when no connection string available", async () => {
      await expect(createVectorStore(mockEmbeddings)).rejects.toThrow(
        "DATABASE_URL is required for vector store",
      );
    });

    it("should prefer provided connection string over env variable", async () => {
      process.env.DATABASE_URL = "postgresql://env:5432/envdb";

      await createVectorStore(mockEmbeddings, {
        connectionString: "postgresql://explicit:5432/explicitdb",
      });

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          postgresConnectionOptions: expect.objectContaining({
            connectionString: "postgresql://explicit:5432/explicitdb",
          }),
        }),
      );
    });
  });

  describe("default configuration", () => {
    it("should use default table name", async () => {
      await createVectorStore(mockEmbeddings, {
        connectionString: "postgresql://test",
      });

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          tableName: "document_chunks",
        }),
      );
    });

    it("should use default column names", async () => {
      await createVectorStore(mockEmbeddings, {
        connectionString: "postgresql://test",
      });

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
        connectionString: "postgresql://test",
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
        connectionString: "postgresql://test",
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
        connectionString: "postgresql://test",
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

  describe("pool configuration", () => {
    it("should limit pool size and set timeouts", async () => {
      await createVectorStore(mockEmbeddings, {
        connectionString: "postgresql://test",
      });

      expect(mockInitialize).toHaveBeenCalledWith(
        mockEmbeddings,
        expect.objectContaining({
          postgresConnectionOptions: expect.objectContaining({
            max: 5,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
          }),
        }),
      );
    });
  });

  describe("error handling", () => {
    it("should propagate initialization errors", async () => {
      mockInitialize.mockRejectedValue(new Error("Connection failed"));

      await expect(
        createVectorStore(mockEmbeddings, {
          connectionString: "postgresql://test",
        }),
      ).rejects.toThrow("Connection failed");
    });
  });
});
