import { Table } from "dynamodb-onetable";
import { createLogger } from "../index.js";
import type { AppTableSchema } from "./schema.js";

const logger = createLogger({ service: "discovered-source-entity" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiscoveryMethod = "map" | "search" | "manual";
export type DiscoveryStatus =
  | "pending_metadata"
  | "pending_content"
  | "approved"
  | "rejected";

export interface DiscoveredSource {
  id: string;
  url: string;
  title: string;
  // Discovery metadata
  discoveryMethod: DiscoveryMethod;
  discoveredAt: string;
  discoveredFrom: string | null;
  // Evaluation results
  status: DiscoveryStatus;
  metadataConfidence: number | null;
  contentConfidence: number | null;
  combinedConfidence: number | null;
  // Extracted metadata
  documentType: string | null;
  topicDomains: string[];
  format: "pdf" | "html" | "text" | null;
  ngbId: string | null;
  priority: "high" | "medium" | "low" | null;
  description: string | null;
  authorityLevel: string | null;
  // LLM reasoning
  metadataReasoning: string | null;
  contentReasoning: string | null;
  // Review tracking
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  sourceConfigId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDiscoveredSourceInput {
  id: string;
  url: string;
  title: string;
  discoveryMethod: DiscoveryMethod;
  discoveredFrom?: string;
}

// ---------------------------------------------------------------------------
// DiscoveredSourceEntity — backed by dynamodb-onetable
// ---------------------------------------------------------------------------

/**
 * Entity class for managing discovered sources in DynamoDB
 * using the OneTable single-table pattern.
 *
 * Table structure:
 * - PK: Discovery#{id}
 * - SK: DiscoveredSource
 *
 * GSIs:
 * - gsi1: Query discoveries by status and date (gsi1pk: Discovery#{status}, gsi1sk: ${discoveredAt})
 */
export class DiscoveredSourceEntity {
  private model;

  constructor(table: Table<typeof AppTableSchema>) {
    this.model = table.getModel("DiscoveredSource");
  }

  // ---------------------------------------------------------------------------
  // Marshalling
  // ---------------------------------------------------------------------------

  /**
   * Convert a OneTable item to the external API shape.
   * Handles undefined -> null conversions.
   */
  private toExternal(item: Record<string, unknown>): DiscoveredSource {
    return {
      id: item.id as string,
      url: item.url as string,
      title: item.title as string,
      discoveryMethod: item.discoveryMethod as DiscoveryMethod,
      discoveredAt: item.discoveredAt as string,
      discoveredFrom: (item.discoveredFrom as string) ?? null,
      status: item.status as DiscoveryStatus,
      metadataConfidence: (item.metadataConfidence as number) ?? null,
      contentConfidence: (item.contentConfidence as number) ?? null,
      combinedConfidence: (item.combinedConfidence as number) ?? null,
      documentType: (item.documentType as string) ?? null,
      topicDomains: (item.topicDomains as string[]) ?? [],
      format: (item.format as DiscoveredSource["format"]) ?? null,
      ngbId: (item.ngbId as string) ?? null,
      priority: (item.priority as DiscoveredSource["priority"]) ?? null,
      description: (item.description as string) ?? null,
      authorityLevel: (item.authorityLevel as string) ?? null,
      metadataReasoning: (item.metadataReasoning as string) ?? null,
      contentReasoning: (item.contentReasoning as string) ?? null,
      reviewedAt: (item.reviewedAt as string) ?? null,
      reviewedBy: (item.reviewedBy as string) ?? null,
      rejectionReason: (item.rejectionReason as string) ?? null,
      sourceConfigId: (item.sourceConfigId as string) ?? null,
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    };
  }

  /**
   * Convert external input to OneTable-compatible properties.
   * Removes null values (OneTable omits undefined fields when nulls: false).
   */
  private toInternal(
    discovery: Partial<DiscoveredSource>,
  ): Record<string, unknown> {
    const item: Record<string, unknown> = { ...discovery };
    // Remove null values — OneTable uses undefined/omission for absent fields
    for (const key of Object.keys(item)) {
      if (item[key] === null) {
        delete item[key];
      }
    }
    return item;
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new discovered source.
   */
  async create(input: CreateDiscoveredSourceInput): Promise<DiscoveredSource> {
    const now = new Date().toISOString();

    const discovery: DiscoveredSource = {
      ...input,
      discoveredAt: now,
      discoveredFrom: input.discoveredFrom ?? null,
      status: "pending_metadata",
      metadataConfidence: null,
      contentConfidence: null,
      combinedConfidence: null,
      documentType: null,
      topicDomains: [],
      format: null,
      ngbId: null,
      priority: null,
      description: null,
      authorityLevel: null,
      metadataReasoning: null,
      contentReasoning: null,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      sourceConfigId: null,
      createdAt: now,
      updatedAt: now,
    };

    logger.info(`Creating discovered source: ${input.id}`, {
      discoveryId: input.id,
      url: input.url,
    });

    await this.model.create(this.toInternal(discovery) as never, {
      exists: null,
    });
    return discovery;
  }

  /**
   * Get a discovered source by ID.
   */
  async getById(id: string): Promise<DiscoveredSource | null> {
    const item = await this.model.get({ id } as never);
    if (!item) return null;
    return this.toExternal(item as unknown as Record<string, unknown>);
  }

  /**
   * Get all discovered sources (all statuses).
   */
  async getAll(): Promise<DiscoveredSource[]> {
    const items = await this.model.scan({} as never);
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  /**
   * Get discovered sources by status via gsi1.
   * Results are ordered by discoveredAt (newest first).
   */
  async getByStatus(status: DiscoveryStatus): Promise<DiscoveredSource[]> {
    const items = await this.model.find(
      {
        gsi1pk: `Discovery#${status}`,
      } as never,
      {
        index: "gsi1",
        reverse: true, // newest first
      },
    );
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  /**
   * Get approved discoveries since a given timestamp.
   * Results are ordered by discoveredAt (newest first).
   */
  async getApprovedSince(since: string): Promise<DiscoveredSource[]> {
    const items = await this.model.find(
      {
        gsi1pk: "Discovery#approved",
        gsi1sk: { $gte: since },
      } as never,
      {
        index: "gsi1",
        reverse: true, // newest first
      },
    );
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  /**
   * Update a discovered source.
   */
  async update(
    id: string,
    updates: Partial<Omit<DiscoveredSource, "id" | "createdAt">>,
  ): Promise<DiscoveredSource> {
    const now = new Date().toISOString();
    const internal = this.toInternal({ ...updates, updatedAt: now });
    const result = await this.model.update({ id, ...internal } as never);
    return this.toExternal(result as unknown as Record<string, unknown>);
  }

  /**
   * Delete a discovered source.
   */
  async delete(id: string): Promise<void> {
    logger.info(`Deleting discovered source: ${id}`, { discoveryId: id });
    await this.model.remove({ id } as never);
  }

  // ---------------------------------------------------------------------------
  // Status transition helpers
  // ---------------------------------------------------------------------------

  /**
   * Mark metadata evaluation complete.
   */
  async markMetadataEvaluated(
    id: string,
    confidence: number,
    reasoning: string,
    suggestedTopicDomains: string[],
    preliminaryDocumentType: string,
  ): Promise<void> {
    const isRelevant = confidence >= 0.5;
    const status: DiscoveryStatus = isRelevant ? "pending_content" : "rejected";

    logger.info(`Marking metadata evaluated: ${id}`, {
      discoveryId: id,
      confidence,
      status,
    });

    await this.update(id, {
      status,
      metadataConfidence: confidence,
      metadataReasoning: reasoning,
      topicDomains: suggestedTopicDomains,
      documentType: preliminaryDocumentType,
    });
  }

  /**
   * Mark content evaluation complete.
   */
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
    const status: DiscoveryStatus =
      combinedConfidence >= autoApprovalThreshold ? "approved" : "rejected";

    logger.info(`Marking content evaluated: ${id}`, {
      discoveryId: id,
      contentConfidence,
      combinedConfidence,
      status,
    });

    await this.update(id, {
      status,
      contentConfidence,
      combinedConfidence,
      contentReasoning: reasoning,
      documentType: extracted.documentType,
      topicDomains: extracted.topicDomains,
      authorityLevel: extracted.authorityLevel,
      priority: extracted.priority,
      description: extracted.description,
      ngbId: extracted.ngbId,
      format: extracted.format,
    });
  }

  /**
   * Manually approve a discovered source.
   */
  async approve(id: string, reviewedBy: string): Promise<void> {
    logger.info(`Manually approving discovered source: ${id}`, {
      discoveryId: id,
      reviewedBy,
    });

    await this.update(id, {
      status: "approved",
      reviewedAt: new Date().toISOString(),
      reviewedBy,
    });
  }

  /**
   * Manually reject a discovered source.
   */
  async reject(id: string, reviewedBy: string, reason: string): Promise<void> {
    logger.info(`Manually rejecting discovered source: ${id}`, {
      discoveryId: id,
      reviewedBy,
      reason,
    });

    await this.update(id, {
      status: "rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy,
      rejectionReason: reason,
    });
  }

  /**
   * Link to a created source config (after approval).
   */
  async linkToSourceConfig(id: string, sourceConfigId: string): Promise<void> {
    logger.info(`Linking discovered source to config: ${id}`, {
      discoveryId: id,
      sourceConfigId,
    });

    await this.update(id, { sourceConfigId });
  }
}
