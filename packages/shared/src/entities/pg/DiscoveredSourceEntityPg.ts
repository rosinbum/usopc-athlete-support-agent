import type { Pool } from "pg";
import type {
  DiscoveredSource,
  CreateDiscoveredSourceInput,
  DiscoveryStatus,
} from "../types.js";

export class DiscoveredSourceEntityPg {
  constructor(private pool: Pool) {}

  async create(input: CreateDiscoveredSourceInput): Promise<DiscoveredSource> {
    const { rows } = await this.pool.query(
      `INSERT INTO discovered_sources (id, url, title, discovery_method, discovered_at, discovered_from)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       RETURNING *`,
      [
        input.id,
        input.url,
        input.title,
        input.discoveryMethod,
        input.discoveredFrom ?? null,
      ],
    );
    return this.toExternal(rows[0]);
  }

  async getById(id: string): Promise<DiscoveredSource | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM discovered_sources WHERE id = $1",
      [id],
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  async getAll(options?: { limit?: number }): Promise<DiscoveredSource[]> {
    const limit = options?.limit ?? 100;
    const { rows } = await this.pool.query(
      "SELECT * FROM discovered_sources ORDER BY discovered_at DESC LIMIT $1",
      [limit],
    );
    return rows.map((r) => this.toExternal(r));
  }

  async getByStatus(
    status: DiscoveryStatus,
    options?: { limit?: number },
  ): Promise<DiscoveredSource[]> {
    const limit = options?.limit ?? 100;
    const { rows } = await this.pool.query(
      `SELECT * FROM discovered_sources WHERE status = $1
       ORDER BY discovered_at DESC LIMIT $2`,
      [status, limit],
    );
    return rows.map((r) => this.toExternal(r));
  }

  async getApprovedSince(since: string): Promise<DiscoveredSource[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM discovered_sources
       WHERE status = 'approved' AND reviewed_at >= $1::timestamptz
       ORDER BY reviewed_at DESC`,
      [since],
    );
    return rows.map((r) => this.toExternal(r));
  }

  async update(
    id: string,
    updates: Partial<Omit<DiscoveredSource, "id" | "createdAt">>,
  ): Promise<DiscoveredSource> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      url: "url",
      title: "title",
      discoveryMethod: "discovery_method",
      discoveredAt: "discovered_at",
      discoveredFrom: "discovered_from",
      status: "status",
      metadataConfidence: "metadata_confidence",
      contentConfidence: "content_confidence",
      combinedConfidence: "combined_confidence",
      documentType: "document_type",
      topicDomains: "topic_domains",
      format: "format",
      ngbId: "ngb_id",
      priority: "priority",
      description: "description",
      authorityLevel: "authority_level",
      metadataReasoning: "metadata_reasoning",
      contentReasoning: "content_reasoning",
      reviewedAt: "reviewed_at",
      reviewedBy: "reviewed_by",
      rejectionReason: "rejection_reason",
      sourceConfigId: "source_config_id",
      lastError: "last_error",
      errorCount: "error_count",
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
      `UPDATE discovered_sources SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return this.toExternal(rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query("DELETE FROM discovered_sources WHERE id = $1", [id]);
  }

  async markMetadataEvaluated(
    id: string,
    confidence: number,
    reasoning: string,
    suggestedTopicDomains: string[],
    preliminaryDocumentType: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE discovered_sources
       SET status = 'pending_content',
           metadata_confidence = $2, metadata_reasoning = $3,
           topic_domains = $4, document_type = $5, updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        confidence,
        reasoning,
        suggestedTopicDomains,
        preliminaryDocumentType,
      ],
    );
  }

  async markContentEvaluated(
    id: string,
    contentConfidence: number,
    combinedConfidence: number,
    extracted: {
      documentType: string;
      topicDomains: string[];
      authorityLevel: string;
      priority: "high" | "medium" | "low";
      description: string;
      ngbId: string | null;
      format: "pdf" | "html" | "text";
    },
    reasoning: string,
    autoApprovalThreshold: number,
  ): Promise<void> {
    const status =
      combinedConfidence >= autoApprovalThreshold
        ? "approved"
        : "pending_content";
    const reviewedAt =
      combinedConfidence >= autoApprovalThreshold ? "NOW()" : "NULL";

    await this.pool.query(
      `UPDATE discovered_sources
       SET status = $2, content_confidence = $3, combined_confidence = $4,
           document_type = $5, topic_domains = $6, authority_level = $7,
           priority = $8, description = $9, ngb_id = $10, format = $11,
           content_reasoning = $12,
           reviewed_at = ${reviewedAt}, reviewed_by = CASE WHEN $2 = 'approved' THEN 'auto' ELSE reviewed_by END,
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        status,
        contentConfidence,
        combinedConfidence,
        extracted.documentType,
        extracted.topicDomains,
        extracted.authorityLevel,
        extracted.priority,
        extracted.description,
        extracted.ngbId,
        extracted.format,
        reasoning,
      ],
    );
  }

  async approve(id: string, reviewedBy: string): Promise<void> {
    await this.pool.query(
      `UPDATE discovered_sources
       SET status = 'approved', reviewed_at = NOW(), reviewed_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, reviewedBy],
    );
  }

  async reject(id: string, reviewedBy: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE discovered_sources
       SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $2, rejection_reason = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, reviewedBy, reason],
    );
  }

  async recordError(id: string, error: string): Promise<DiscoveredSource> {
    const { rows } = await this.pool.query(
      `UPDATE discovered_sources
       SET last_error = $2, error_count = error_count + 1, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, error],
    );
    return this.toExternal(rows[0]);
  }

  async clearError(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE discovered_sources
       SET last_error = NULL, error_count = 0, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }

  async linkToSourceConfig(id: string, sourceConfigId: string): Promise<void> {
    await this.pool.query(
      `UPDATE discovered_sources SET source_config_id = $2, updated_at = NOW() WHERE id = $1`,
      [id, sourceConfigId],
    );
  }

  private toExternal(row: Record<string, unknown>): DiscoveredSource {
    return {
      id: row.id as string,
      url: row.url as string,
      title: row.title as string,
      discoveryMethod:
        row.discovery_method as DiscoveredSource["discoveryMethod"],
      discoveredAt: (row.discovered_at as Date).toISOString(),
      discoveredFrom: row.discovered_from as string | null,
      status: row.status as DiscoveredSource["status"],
      metadataConfidence: row.metadata_confidence as number | null,
      contentConfidence: row.content_confidence as number | null,
      combinedConfidence: row.combined_confidence as number | null,
      documentType: row.document_type as string | null,
      topicDomains: (row.topic_domains as string[]) ?? [],
      format: row.format as DiscoveredSource["format"],
      ngbId: row.ngb_id as string | null,
      priority: row.priority as DiscoveredSource["priority"],
      description: row.description as string | null,
      authorityLevel: row.authority_level as string | null,
      metadataReasoning: row.metadata_reasoning as string | null,
      contentReasoning: row.content_reasoning as string | null,
      reviewedAt: row.reviewed_at
        ? (row.reviewed_at as Date).toISOString()
        : null,
      reviewedBy: row.reviewed_by as string | null,
      rejectionReason: row.rejection_reason as string | null,
      sourceConfigId: row.source_config_id as string | null,
      lastError: row.last_error as string | null,
      errorCount: row.error_count as number,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }
}
