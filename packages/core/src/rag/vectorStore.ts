import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { Pool } from "pg";
import { getPool } from "@usopc/shared";

export interface VectorStoreConfig {
  pool?: Pool;
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
  embeddings: EmbeddingsInterface,
  config?: VectorStoreConfig,
): Promise<PGVectorStore> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const pool = mergedConfig.pool ?? getPool();

  return await PGVectorStore.initialize(embeddings, {
    pool,
    tableName: mergedConfig.tableName!,
    ...(mergedConfig.columns !== undefined
      ? { columns: mergedConfig.columns }
      : {}),
  });
}
