import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

/**
 * Creates a PostgresSaver checkpointer from a connection string.
 * Calls `setup()` to ensure checkpoint tables exist (idempotent DDL).
 */
export async function createPostgresCheckpointer(
  connString: string,
): Promise<BaseCheckpointSaver> {
  const saver = PostgresSaver.fromConnString(connString);
  await saver.setup();
  return saver;
}

/**
 * Creates an in-memory checkpointer for tests.
 */
export function createMemoryCheckpointer(): BaseCheckpointSaver {
  return new MemorySaver();
}
