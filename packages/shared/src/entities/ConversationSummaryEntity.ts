import { Table } from "dynamodb-onetable";
import type { AppTableSchema } from "./schema.js";

export interface ConversationSummary {
  conversationId: string;
  summary: string;
  ttl?: number | undefined;
  updatedAt?: string | undefined;
}

export class ConversationSummaryEntity {
  private model;

  constructor(table: Table<typeof AppTableSchema>) {
    this.model = table.getModel("ConversationSummary");
  }

  private toExternal(item: Record<string, unknown>): ConversationSummary {
    return {
      conversationId: item.conversationId as string,
      summary: item.summary as string,
      ttl: item.ttl as number | undefined,
      updatedAt: item.updatedAt as string | undefined,
    };
  }

  /**
   * Get a conversation summary by ID.
   * Returns null if not found or if the TTL has expired.
   * DynamoDB TTL deletion is eventually consistent, so we check app-side too.
   */
  async get(conversationId: string): Promise<ConversationSummary | null> {
    const item = await this.model.get({ conversationId } as never);
    if (!item) return null;

    const record = item as unknown as Record<string, unknown>;
    // App-side TTL check — DynamoDB TTL deletion is eventually consistent
    if (
      typeof record.ttl === "number" &&
      record.ttl <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return this.toExternal(record);
  }

  /**
   * Create or overwrite a conversation summary with a TTL.
   * @param conversationId - The conversation identifier
   * @param summary - The summary text
   * @param ttlSeconds - Time-to-live in seconds from now
   */
  async upsert(
    conversationId: string,
    summary: string,
    ttlSeconds: number,
  ): Promise<ConversationSummary> {
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;

    const result = await this.model.upsert(
      {
        conversationId,
        summary,
        ttl,
        updatedAt: now,
      } as never,
      { exists: null } as never,
    );

    return this.toExternal(result as unknown as Record<string, unknown>);
  }
}
