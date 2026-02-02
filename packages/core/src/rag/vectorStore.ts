import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import type { OpenAIEmbeddings } from "@langchain/openai";
import type { PoolConfig } from "pg";

export interface VectorStoreConfig {
  connectionString?: string;
  tableName?: string;
  columns?: {
    idColumnName?: string;
    vectorColumnName?: string;
    contentColumnName?: string;
    metadataColumnName?: string;
  };
}

const DEFAULT_CONFIG: VectorStoreConfig = {
  tableName: "document_chunks",
  columns: {
    idColumnName: "id",
    vectorColumnName: "embedding",
    contentColumnName: "content",
    metadataColumnName: "metadata",
  },
};

export async function createVectorStore(
  embeddings: OpenAIEmbeddings,
  config?: VectorStoreConfig,
): Promise<PGVectorStore> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const connectionString =
    mergedConfig.connectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for vector store");
  }

  const pgConfig: PoolConfig = {
    connectionString,
  };

  return await PGVectorStore.initialize(embeddings, {
    postgresConnectionOptions: pgConfig,
    tableName: mergedConfig.tableName!,
    columns: mergedConfig.columns,
  });
}
