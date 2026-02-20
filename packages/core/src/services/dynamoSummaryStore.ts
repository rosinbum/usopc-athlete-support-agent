import type { ConversationSummaryEntity } from "@usopc/shared";
import type { SummaryStore } from "./conversationMemory.js";
import { getSummaryTtlMs } from "./conversationMemory.js";

/**
 * DynamoDB-backed summary store. Wraps a {@link ConversationSummaryEntity}
 * to persist conversation summaries across Lambda cold starts.
 *
 * TTL is set on each upsert so DynamoDB auto-deletes expired items.
 * The entity also checks TTL app-side since DynamoDB TTL deletion
 * is eventually consistent.
 */
export class DynamoSummaryStore implements SummaryStore {
  constructor(
    private entity: ConversationSummaryEntity,
    private ttlMs?: number,
  ) {}

  async get(conversationId: string): Promise<string | undefined> {
    const item = await this.entity.get(conversationId);
    return item?.summary;
  }

  async set(conversationId: string, summary: string): Promise<void> {
    const ttlSec = Math.floor((this.ttlMs ?? getSummaryTtlMs()) / 1000);
    await this.entity.upsert(conversationId, summary, ttlSec);
  }
}
