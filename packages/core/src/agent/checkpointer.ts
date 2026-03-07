import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { Pool } from "pg";

/**
 * Creates a PostgresSaver checkpointer using an existing pool.
 * Calls `setup()` to ensure checkpoint tables exist (idempotent DDL).
 *
 * IMPORTANT: The returned checkpointer shares the provided pool.
 * Do NOT call `checkpointer.end()` — it would destroy the shared pool.
 * Pool lifecycle is managed by `closePool()` in `@usopc/shared`.
 */
export async function createPostgresCheckpointer(
  pool: Pool,
): Promise<BaseCheckpointSaver> {
  const saver = new PostgresSaver(pool);
  await saver.setup();
  return saver;
}

/**
 * Creates an in-memory checkpointer for tests.
 */
export function createMemoryCheckpointer(): BaseCheckpointSaver {
  return new MemorySaver();
}
