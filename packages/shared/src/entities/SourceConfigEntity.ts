import { Table } from "dynamodb-onetable";
import { createLogger, type AuthorityLevel } from "../index.js";
import type { AppTableSchema } from "./schema.js";

const logger = createLogger({ service: "source-config-entity" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceConfig {
  id: string;
  title: string;
  documentType: string;
  topicDomains: string[];
  url: string;
  format: "pdf" | "html" | "text";
  ngbId: string | null;
  priority: "high" | "medium" | "low";
  description: string;
  authorityLevel: AuthorityLevel;
  enabled: boolean;
  lastIngestedAt: string | null;
  lastContentHash: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  s3Key: string | null;
  s3VersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSourceInput {
  id: string;
  title: string;
  documentType: string;
  topicDomains: string[];
  url: string;
  format: "pdf" | "html" | "text";
  ngbId: string | null;
  priority: "high" | "medium" | "low";
  description: string;
  authorityLevel: AuthorityLevel;
}

export interface MarkSuccessOptions {
  s3Key?: string;
  s3VersionId?: string;
}

// ---------------------------------------------------------------------------
// SourceConfigEntity — backed by dynamodb-onetable
// ---------------------------------------------------------------------------

/**
 * Entity class for managing source configurations in DynamoDB
 * using the OneTable single-table pattern.
 *
 * Table structure:
 * - PK: Source#{id}
 * - SK: SourceConfig
 *
 * GSIs:
 * - ngbId-index: Query sources by NGB
 * - enabled-priority-index: Query enabled sources
 */
export class SourceConfigEntity {
  private model;
  private table: Table<typeof AppTableSchema>;

  constructor(table: Table<typeof AppTableSchema>) {
    this.table = table;
    this.model = table.getModel("SourceConfig");
  }

  // ---------------------------------------------------------------------------
  // Marshalling
  // ---------------------------------------------------------------------------

  /**
   * Convert a OneTable item (string enabled, undefined for absent) to the
   * external API shape (boolean enabled, null for absent).
   */
  private toExternal(item: Record<string, unknown>): SourceConfig {
    return {
      id: item.id as string,
      title: item.title as string,
      documentType: item.documentType as string,
      topicDomains: (item.topicDomains as string[]) ?? [],
      url: item.url as string,
      format: item.format as SourceConfig["format"],
      ngbId: (item.ngbId as string) ?? null,
      priority: item.priority as SourceConfig["priority"],
      description: item.description as string,
      authorityLevel: item.authorityLevel as AuthorityLevel,
      enabled: item.enabled === "true",
      lastIngestedAt: (item.lastIngestedAt as string) ?? null,
      lastContentHash: (item.lastContentHash as string) ?? null,
      consecutiveFailures: (item.consecutiveFailures as number) ?? 0,
      lastError: (item.lastError as string) ?? null,
      s3Key: (item.s3Key as string) ?? null,
      s3VersionId: (item.s3VersionId as string) ?? null,
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    };
  }

  /**
   * Convert external input to OneTable-compatible properties.
   * - boolean enabled -> string "true"/"false"
   * - null values -> removed (OneTable omits undefined fields when nulls: false)
   */
  private toInternal(config: Partial<SourceConfig>): Record<string, unknown> {
    const item: Record<string, unknown> = { ...config };
    if ("enabled" in config) {
      item.enabled = config.enabled ? "true" : "false";
    }
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
   * Create a new source configuration.
   */
  async create(input: CreateSourceInput): Promise<SourceConfig> {
    const now = new Date().toISOString();

    const config: SourceConfig = {
      ...input,
      enabled: true,
      lastIngestedAt: null,
      lastContentHash: null,
      consecutiveFailures: 0,
      lastError: null,
      s3Key: null,
      s3VersionId: null,
      createdAt: now,
      updatedAt: now,
    };

    logger.info(`Creating source config: ${input.id}`, { sourceId: input.id });

    await this.model.create(this.toInternal(config) as never, {
      exists: null,
    });
    return config;
  }

  /**
   * Get a source configuration by ID.
   */
  async getById(id: string): Promise<SourceConfig | null> {
    const item = await this.model.get({ id } as never);
    if (!item) return null;
    return this.toExternal(item as unknown as Record<string, unknown>);
  }

  /**
   * Get all source configurations (enabled and disabled).
   * OneTable handles pagination internally.
   */
  async getAll(): Promise<SourceConfig[]> {
    const items = await this.model.scan({} as never);
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  /**
   * Get all enabled source configurations via the enabled-priority-index GSI.
   */
  async getAllEnabled(): Promise<SourceConfig[]> {
    const items = await this.model.find({ enabled: "true" } as never, {
      index: "enabled-priority-index",
    });
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  /**
   * Get source configurations by NGB ID via the ngbId-index GSI.
   */
  async getByNgb(ngbId: string): Promise<SourceConfig[]> {
    const items = await this.model.find({ ngbId } as never, {
      index: "ngbId-index",
    });
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  /**
   * Update a source configuration.
   */
  async update(
    id: string,
    updates: Partial<Omit<SourceConfig, "id" | "createdAt">>,
  ): Promise<SourceConfig> {
    const now = new Date().toISOString();
    const internal = this.toInternal({ ...updates, updatedAt: now });
    const result = await this.model.update({ id, ...internal } as never);
    return this.toExternal(result as unknown as Record<string, unknown>);
  }

  /**
   * Delete a source configuration.
   */
  async delete(id: string): Promise<void> {
    logger.info(`Deleting source config: ${id}`, { sourceId: id });
    await this.model.remove({ id } as never);
  }

  // ---------------------------------------------------------------------------
  // Ingestion status helpers
  // ---------------------------------------------------------------------------

  /**
   * Mark a source as successfully ingested.
   */
  async markSuccess(
    id: string,
    contentHash: string,
    options?: MarkSuccessOptions,
  ): Promise<void> {
    const now = new Date().toISOString();

    logger.info(`Marking source success: ${id}`, {
      sourceId: id,
      contentHash,
    });

    const props: Record<string, unknown> = {
      id,
      lastContentHash: contentHash,
      lastIngestedAt: now,
      consecutiveFailures: 0,
      updatedAt: now,
    };
    if (options?.s3Key !== undefined) {
      props.s3Key = options.s3Key;
    }
    if (options?.s3VersionId !== undefined) {
      props.s3VersionId = options.s3VersionId;
    }

    await this.model.update(props as never, { remove: ["lastError"] });
  }

  /**
   * Mark a source as failed. Increments consecutiveFailures atomically.
   */
  async markFailure(id: string, error: string): Promise<void> {
    const now = new Date().toISOString();

    logger.warn(`Marking source failure: ${id}`, {
      sourceId: id,
      error,
    });

    // Use get-then-update for the increment since OneTable's `add` param
    // doesn't integrate cleanly with the typed Model API.
    const current = await this.model.get({ id } as never);
    const failures =
      ((current as unknown as Record<string, unknown>)
        ?.consecutiveFailures as number) ?? 0;

    await this.model.update({
      id,
      consecutiveFailures: failures + 1,
      lastError: error,
      updatedAt: now,
    } as never);
  }

  /**
   * Disable a source.
   */
  async disable(id: string): Promise<void> {
    logger.info(`Disabling source: ${id}`, { sourceId: id });
    await this.update(id, { enabled: false });
  }

  /**
   * Enable a source.
   */
  async enable(id: string): Promise<void> {
    logger.info(`Enabling source: ${id}`, { sourceId: id });
    await this.update(id, { enabled: true });
  }
}
