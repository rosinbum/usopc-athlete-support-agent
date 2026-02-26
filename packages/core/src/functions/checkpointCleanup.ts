import pg from "pg";
import { getDatabaseUrl } from "@usopc/shared";
import { logger } from "@usopc/shared";

const log = logger.child({ service: "checkpoint-cleanup" });

const RETENTION_DAYS = 7;

/**
 * Lambda handler that deletes checkpoint rows older than the retention period.
 * Runs on a daily cron schedule. Creates its own pool to avoid contention
 * with the shared singleton pool.
 */
export async function handler(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: getDatabaseUrl(),
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    // PostgresSaver creates tables: checkpoints, checkpoint_writes, checkpoint_blobs
    // All have a thread_id column; checkpoints has a created_at timestamp
    const result = await pool.query(
      `DELETE FROM checkpoints WHERE created_at < $1`,
      [cutoff.toISOString()],
    );

    log.info("Checkpoint cleanup complete", {
      deletedRows: result.rowCount,
      cutoffDate: cutoff.toISOString(),
    });

    // Clean up orphaned writes and blobs that reference deleted checkpoints
    const writesResult = await pool.query(
      `DELETE FROM checkpoint_writes
       WHERE (thread_id, checkpoint_id) NOT IN (
         SELECT thread_id, checkpoint_id FROM checkpoints
       )`,
    );

    log.info("Orphaned checkpoint_writes cleaned", {
      deletedRows: writesResult.rowCount,
    });

    const blobsResult = await pool.query(
      `DELETE FROM checkpoint_blobs
       WHERE (thread_id, checkpoint_ns, channel, version) NOT IN (
         SELECT DISTINCT thread_id, checkpoint_ns, channel, version
         FROM checkpoint_writes
       )`,
    );

    log.info("Orphaned checkpoint_blobs cleaned", {
      deletedRows: blobsResult.rowCount,
    });
  } catch (error) {
    log.error("Checkpoint cleanup failed", { error: String(error) });
    throw error;
  } finally {
    await pool.end();
  }
}
