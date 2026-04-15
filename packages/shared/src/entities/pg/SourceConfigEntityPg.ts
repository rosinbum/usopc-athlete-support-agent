import type { Pool } from "pg";
import type {
  SourceConfig,
  CreateSourceInput,
  MarkSuccessOptions,
} from "../types.js";
import type { AuthorityLevel } from "../../validation.js";

export class SourceConfigEntityPg {
  constructor(private pool: Pool) {}

  async create(input: CreateSourceInput): Promise<SourceConfig> {
    const { rows } = await this.pool.query(
      `INSERT INTO source_configs
         (id, title, document_type, topic_domains, url, format, ngb_id, priority, description, authority_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.id,
        input.title,
        input.documentType,
        input.topicDomains,
        input.url,
        input.format,
        input.ngbId,
        input.priority,
        input.description,
        input.authorityLevel,
      ],
    );
    return this.toExternal(rows[0]);
  }

  async getById(id: string): Promise<SourceConfig | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM source_configs WHERE id = $1",
      [id],
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  async getAll(): Promise<SourceConfig[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM source_configs ORDER BY created_at DESC",
    );
    return rows.map((r) => this.toExternal(r));
  }

  async getAllEnabled(): Promise<SourceConfig[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM source_configs WHERE enabled = true ORDER BY priority, created_at DESC",
    );
    return rows.map((r) => this.toExternal(r));
  }

  async getByNgb(ngbId: string): Promise<SourceConfig[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM source_configs WHERE ngb_id = $1 ORDER BY created_at DESC",
      [ngbId],
    );
    return rows.map((r) => this.toExternal(r));
  }

  async update(
    id: string,
    updates: Partial<Omit<SourceConfig, "id" | "createdAt">>,
  ): Promise<SourceConfig> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      title: "title",
      documentType: "document_type",
      topicDomains: "topic_domains",
      url: "url",
      format: "format",
      ngbId: "ngb_id",
      priority: "priority",
      description: "description",
      authorityLevel: "authority_level",
      enabled: "enabled",
      lastIngestedAt: "last_ingested_at",
      lastContentHash: "last_content_hash",
      consecutiveFailures: "consecutive_failures",
      lastError: "last_error",
      storageKey: "storage_key",
      storageVersionId: "storage_version_id",
    };

    for (const [key, col] of Object.entries(columnMap)) {
      if (key in updates) {
        setClauses.push(`${col} = $${idx}`);
        values.push((updates as Record<string, unknown>)[key]);
        idx++;
      }
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await this.pool.query(
      `UPDATE source_configs SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return this.toExternal(rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query("DELETE FROM source_configs WHERE id = $1", [id]);
  }

  async markSuccess(
    id: string,
    contentHash: string,
    options?: MarkSuccessOptions,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE source_configs
       SET last_ingested_at = NOW(), last_content_hash = $2,
           consecutive_failures = 0, last_error = NULL,
           storage_key = COALESCE($3, storage_key),
           storage_version_id = COALESCE($4, storage_version_id),
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        contentHash,
        options?.storageKey ?? null,
        options?.storageVersionId ?? null,
      ],
    );
  }

  async markFailure(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE source_configs
       SET consecutive_failures = consecutive_failures + 1, last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, error],
    );
  }

  async disable(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE source_configs SET enabled = false, updated_at = NOW() WHERE id = $1",
      [id],
    );
  }

  async enable(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE source_configs SET enabled = true, updated_at = NOW() WHERE id = $1",
      [id],
    );
  }

  private toExternal(row: Record<string, unknown>): SourceConfig {
    return {
      id: row.id as string,
      title: row.title as string,
      documentType: row.document_type as string,
      topicDomains: row.topic_domains as string[],
      url: row.url as string,
      format: row.format as "pdf" | "html" | "text",
      ngbId: row.ngb_id as string | null,
      priority: row.priority as "high" | "medium" | "low",
      description: row.description as string,
      authorityLevel: row.authority_level as AuthorityLevel,
      enabled: row.enabled as boolean,
      lastIngestedAt: row.last_ingested_at
        ? (row.last_ingested_at as Date).toISOString()
        : null,
      lastContentHash: row.last_content_hash as string | null,
      consecutiveFailures: row.consecutive_failures as number,
      lastError: row.last_error as string | null,
      storageKey: row.storage_key as string | null,
      storageVersionId: row.storage_version_id as string | null,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }
}
