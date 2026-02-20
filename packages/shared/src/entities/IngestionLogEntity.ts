import { Table } from "dynamodb-onetable";
import { createLogger } from "../index.js";
import type { AppTableSchema } from "./schema.js";

const logger = createLogger({ service: "ingestion-log-entity" });

export interface IngestionLog {
  sourceId: string;
  sourceUrl: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  contentHash?: string | undefined;
  chunksCount?: number | undefined;
  errorMessage?: string | undefined;
  startedAt: string;
  completedAt?: string | undefined;
  createdAt: string;
}

export class IngestionLogEntity {
  private model;
  private table: Table<typeof AppTableSchema>;

  constructor(table: Table<typeof AppTableSchema>) {
    this.table = table;
    this.model = table.getModel("IngestionLog");
  }

  private toExternal(item: Record<string, unknown>): IngestionLog {
    return {
      sourceId: item.sourceId as string,
      sourceUrl: item.sourceUrl as string,
      status: item.status as IngestionLog["status"],
      contentHash: item.contentHash as string | undefined,
      chunksCount: item.chunksCount as number | undefined,
      errorMessage: item.errorMessage as string | undefined,
      startedAt: item.startedAt as string,
      completedAt: item.completedAt as string | undefined,
      createdAt: item.createdAt as string,
    };
  }

  /**
   * Create a new ingestion log entry.
   */
  async create(input: {
    sourceId: string;
    sourceUrl: string;
    status: IngestionLog["status"];
    contentHash?: string;
    chunksCount?: number;
    errorMessage?: string;
  }): Promise<IngestionLog> {
    const now = new Date().toISOString();
    const item: Record<string, unknown> = {
      sourceId: input.sourceId,
      sourceUrl: input.sourceUrl,
      status: input.status,
      startedAt: now,
      createdAt: now,
    };
    if (input.contentHash) item.contentHash = input.contentHash;
    if (input.chunksCount !== undefined) item.chunksCount = input.chunksCount;
    if (input.errorMessage) item.errorMessage = input.errorMessage;

    logger.info(`Creating ingestion log for source: ${input.sourceId}`, {
      sourceId: input.sourceId,
      status: input.status,
    });

    const result = await this.model.create(item as never);
    return this.toExternal(result as unknown as Record<string, unknown>);
  }

  /**
   * Get ingestion logs for a specific source, ordered by most recent first.
   */
  async getForSource(sourceId: string, limit = 10): Promise<IngestionLog[]> {
    const items = await this.model.find({ sourceId } as never, {
      reverse: true,
      limit,
    });
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  /**
   * Get recent ingestion logs across all sources (via gsi1).
   */
  async getRecent(limit = 20): Promise<IngestionLog[]> {
    const items = await this.model.find({ gsi1pk: "Ingest" } as never, {
      index: "gsi1",
      reverse: true,
      limit,
    });
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  /**
   * Update the status of an ingestion log entry.
   */
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
    const props: Record<string, unknown> = {
      sourceId,
      startedAt,
      status,
    };
    if (fields?.contentHash) props.contentHash = fields.contentHash;
    if (fields?.chunksCount !== undefined)
      props.chunksCount = fields.chunksCount;
    if (fields?.errorMessage) props.errorMessage = fields.errorMessage;
    if (fields?.completedAt) props.completedAt = fields.completedAt;

    await this.model.update(props as never);
  }

  /**
   * Get the content hash from the most recent completed ingestion for a source.
   */
  async getLastContentHash(sourceId: string): Promise<string | null> {
    const items = await this.model.find({ sourceId } as never, {
      reverse: true,
      limit: 20,
    });
    // Find the most recent completed entry
    for (const item of items) {
      const record = item as unknown as Record<string, unknown>;
      if (record.status === "completed" && record.contentHash) {
        return record.contentHash as string;
      }
    }
    return null;
  }
}
