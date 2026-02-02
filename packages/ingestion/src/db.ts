import type { Pool } from "pg";

/**
 * Retrieve the content hash of the last successful ingestion for a source.
 */
export async function getLastContentHash(
  pool: Pool,
  sourceId: string,
): Promise<string | null> {
  const result = await pool.query(
    `SELECT content_hash FROM ingestion_status
     WHERE source_id = $1 AND status = 'completed'
     ORDER BY completed_at DESC LIMIT 1`,
    [sourceId],
  );
  return result.rows[0]?.content_hash ?? null;
}

/**
 * Insert or update an ingestion status row.
 *
 * Supported statuses: "ingesting", "completed", "failed", "quota_exceeded".
 */
export async function upsertIngestionStatus(
  pool: Pool,
  sourceId: string,
  sourceUrl: string,
  status: string,
  fields: {
    contentHash?: string;
    chunksCount?: number;
    errorMessage?: string;
  } = {},
): Promise<void> {
  if (status === "ingesting") {
    await pool.query(
      `INSERT INTO ingestion_status (source_id, source_url, status, started_at)
       VALUES ($1, $2, $3, NOW())`,
      [sourceId, sourceUrl, status],
    );
  } else if (status === "completed") {
    await pool.query(
      `UPDATE ingestion_status
       SET status = $1, content_hash = $2, chunks_count = $3, completed_at = NOW()
       WHERE source_id = $4 AND status = 'ingesting'
       ORDER BY started_at DESC LIMIT 1`,
      [status, fields.contentHash, fields.chunksCount, sourceId],
    );
  } else if (status === "failed" || status === "quota_exceeded") {
    await pool.query(
      `UPDATE ingestion_status
       SET status = $1, error_message = $2, completed_at = NOW()
       WHERE source_id = $3 AND status = 'ingesting'
       ORDER BY started_at DESC LIMIT 1`,
      [status, fields.errorMessage, sourceId],
    );
  }
}
