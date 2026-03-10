import pg from "pg";
import { getDatabaseUrl } from "@usopc/shared";
import { logger } from "@usopc/shared";

const log = logger.child({ service: "checkpoint-cleanup" });

const RETENTION_DAYS = 7;
const DELETE_BATCH_SIZE = 500;

/**
 * Ensures a `created_at` column exists on the `checkpoints` table.
 *
 * PostgresSaver's DDL does not include a timestamp column. We add one
 * ourselves (idempotent) so the cleanup handler can delete old rows.
 * New rows auto-populate via DEFAULT; existing rows get the migration
 * timestamp (conservative — they'll be cleaned up after RETENTION_DAYS).
 *
 * Verified against @langchain/langgraph-checkpoint-postgres@1.0.1 schema.
 */
const CHECKPOINT_TABLES = [
  "checkpoint_blobs",
  "checkpoint_writes",
  "checkpoints",
] as const;

async function deleteFromTable(
  pool: pg.Pool,
  table: string,
  threadIds: string[],
): Promise<number> {
  const result = await pool.query(
    `DELETE FROM ${table} WHERE thread_id = ANY($1)`,
    [threadIds],
  );
  return result.rowCount ?? 0;
}

async function ensureCreatedAtColumn(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE checkpoints
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
}

/**
 * Lambda handler that deletes checkpoint rows older than the retention period.
 * Runs on a daily cron schedule. Creates its own pool to avoid contention
 * with the shared singleton pool.
 *
 * PostgresSaver schema (v1.0.1) has no foreign keys between tables, so
 * cleanup deletes by thread_id across all three tables in a single pass.
 */
export async function handler(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: getDatabaseUrl(),
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  try {
    await ensureCreatedAtColumn(pool);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    // Find threads with all checkpoints older than the cutoff
    const staleThreads = await pool.query<{ thread_id: string }>(
      `SELECT DISTINCT thread_id FROM checkpoints
       WHERE thread_id NOT IN (
         SELECT DISTINCT thread_id FROM checkpoints WHERE created_at >= $1
       )`,
      [cutoff.toISOString()],
    );

    if (staleThreads.rows.length === 0) {
      log.info("No stale checkpoint threads to clean up");
      return;
    }

    const threadIds = staleThreads.rows.map((r) => r.thread_id);
    log.info("Cleaning up stale checkpoint threads", {
      count: threadIds.length,
    });

    // Delete in batches to avoid oversized query plans and row-level locks
    const deleted: Record<string, number> = {};
    for (const table of CHECKPOINT_TABLES) {
      deleted[table] = 0;
    }

    for (let i = 0; i < threadIds.length; i += DELETE_BATCH_SIZE) {
      const batch = threadIds.slice(i, i + DELETE_BATCH_SIZE);
      for (const table of CHECKPOINT_TABLES) {
        deleted[table]! += await deleteFromTable(pool, table, batch);
      }
    }

    log.info("Checkpoint cleanup complete", {
      threads: threadIds.length,
      deletedCheckpoints: deleted["checkpoints"],
      deletedWrites: deleted["checkpoint_writes"],
      deletedBlobs: deleted["checkpoint_blobs"],
      cutoffDate: cutoff.toISOString(),
    });
  } catch (error) {
    log.error("Checkpoint cleanup failed", { error: String(error) });
    throw error;
  } finally {
    await pool.end();
  }
}
