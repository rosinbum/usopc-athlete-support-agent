import type { Pool } from "pg";
import type { IngestionLog } from "../types.js";

export class IngestionLogEntityPg {
  constructor(private pool: Pool) {}

  async create(input: {
    sourceId: string;
    sourceUrl: string;
    status: IngestionLog["status"];
    contentHash?: string;
    chunksCount?: number;
    errorMessage?: string;
  }): Promise<IngestionLog> {
    const { rows } = await this.pool.query(
      `INSERT INTO ingestion_logs (source_id, source_url, status, content_hash, chunks_count, error_message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.sourceId,
        input.sourceUrl,
        input.status,
        input.contentHash ?? null,
        input.chunksCount ?? null,
        input.errorMessage ?? null,
      ],
    );
    return this.toExternal(rows[0]);
  }

  async getForSource(sourceId: string, limit = 20): Promise<IngestionLog[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ingestion_logs WHERE source_id = $1
       ORDER BY started_at DESC LIMIT $2`,
      [sourceId, limit],
    );
    return rows.map((r) => this.toExternal(r));
  }

  async getRecent(limit = 50): Promise<IngestionLog[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM ingestion_logs ORDER BY started_at DESC LIMIT $1",
      [limit],
    );
    return rows.map((r) => this.toExternal(r));
  }

  async updateStatus(
    sourceId: string,
    startedAt: string,
    status: IngestionLog["status"],
    fields?: {
      contentHash?: string | undefined;
      chunksCount?: number | undefined;
      errorMessage?: string | undefined;
      completedAt?: string | undefined;
    },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE ingestion_logs
       SET status = $3,
           content_hash = COALESCE($4, content_hash),
           chunks_count = COALESCE($5, chunks_count),
           error_message = COALESCE($6, error_message),
           completed_at = COALESCE($7::timestamptz, completed_at)
       WHERE source_id = $1 AND started_at = $2::timestamptz`,
      [
        sourceId,
        startedAt,
        status,
        fields?.contentHash ?? null,
        fields?.chunksCount ?? null,
        fields?.errorMessage ?? null,
        fields?.completedAt ?? null,
      ],
    );
  }

  async getLastContentHash(sourceId: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      `SELECT content_hash FROM ingestion_logs
       WHERE source_id = $1 AND status = 'completed' AND content_hash IS NOT NULL
       ORDER BY started_at DESC LIMIT 1`,
      [sourceId],
    );
    return rows.length > 0 ? (rows[0].content_hash as string) : null;
  }

  private toExternal(row: Record<string, unknown>): IngestionLog {
    return {
      sourceId: row.source_id as string,
      sourceUrl: row.source_url as string,
      status: row.status as IngestionLog["status"],
      contentHash: (row.content_hash as string) ?? undefined,
      chunksCount: (row.chunks_count as number) ?? undefined,
      errorMessage: (row.error_message as string) ?? undefined,
      startedAt: (row.started_at as Date).toISOString(),
      completedAt: row.completed_at
        ? (row.completed_at as Date).toISOString()
        : undefined,
      createdAt: (row.created_at as Date).toISOString(),
    };
  }
}
