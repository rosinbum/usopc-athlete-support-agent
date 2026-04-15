import type { Pool } from "pg";
import type { DiscoveryRun } from "../types.js";

export class DiscoveryRunEntityPg {
  private currentRunId: string | null = null;

  constructor(private pool: Pool) {}

  async markRunning(triggeredBy: string): Promise<void> {
    const { rows } = await this.pool.query(
      `INSERT INTO discovery_runs (status, triggered_by, started_at)
       VALUES ('running', $1, NOW()) RETURNING id`,
      [triggeredBy],
    );
    this.currentRunId = rows[0].id as string;
  }

  async markCompleted(stats: {
    discovered: number;
    enqueued: number;
    skipped: number;
    errors: number;
  }): Promise<void> {
    if (!this.currentRunId) return;
    await this.pool.query(
      `UPDATE discovery_runs
       SET status = 'completed', completed_at = NOW(),
           discovered = $2, enqueued = $3, skipped = $4, errors = $5
       WHERE id = $1`,
      [
        this.currentRunId,
        stats.discovered,
        stats.enqueued,
        stats.skipped,
        stats.errors,
      ],
    );
    this.currentRunId = null;
  }

  async markFailed(errorMessage: string): Promise<void> {
    if (!this.currentRunId) return;
    await this.pool.query(
      `UPDATE discovery_runs
       SET status = 'failed', completed_at = NOW(), error_message = $2
       WHERE id = $1`,
      [this.currentRunId, errorMessage],
    );
    this.currentRunId = null;
  }

  async getLatest(): Promise<DiscoveryRun | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM discovery_runs ORDER BY started_at DESC LIMIT 1",
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  private toExternal(row: Record<string, unknown>): DiscoveryRun {
    return {
      status: row.status as DiscoveryRun["status"],
      triggeredBy: row.triggered_by as string,
      startedAt: (row.started_at as Date).toISOString(),
      completedAt: row.completed_at
        ? (row.completed_at as Date).toISOString()
        : undefined,
      discovered: (row.discovered as number) ?? undefined,
      enqueued: (row.enqueued as number) ?? undefined,
      skipped: (row.skipped as number) ?? undefined,
      errors: (row.errors as number) ?? undefined,
      errorMessage: (row.error_message as string) ?? undefined,
    };
  }
}
