import type { Table } from "dynamodb-onetable";
import type { AppTableSchema } from "./schema.js";

export interface Feedback {
  id: string;
  conversationId: string;
  channel: "slack" | "web";
  score: number;
  comment?: string | undefined;
  messageId?: string | undefined;
  userId?: string | undefined;
  runId?: string | undefined;
  createdAt?: string | undefined;
}

export interface CreateFeedbackInput {
  conversationId: string;
  channel: "slack" | "web";
  score: number;
  comment?: string | undefined;
  messageId?: string | undefined;
  userId?: string | undefined;
  runId?: string | undefined;
}

export class FeedbackEntity {
  private model;

  constructor(table: Table<typeof AppTableSchema>) {
    this.model = table.getModel("Feedback");
  }

  private toExternal(item: Record<string, unknown>): Feedback {
    return {
      id: item.id as string,
      conversationId: item.conversationId as string,
      channel: item.channel as "slack" | "web",
      score: item.score as number,
      comment: item.comment as string | undefined,
      messageId: item.messageId as string | undefined,
      userId: item.userId as string | undefined,
      runId: item.runId as string | undefined,
      createdAt: item.createdAt as string | undefined,
    };
  }

  async create(input: CreateFeedbackInput): Promise<Feedback> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const item: Record<string, unknown> = {
      id,
      conversationId: input.conversationId,
      channel: input.channel,
      score: input.score,
      createdAt: now,
    };
    if (input.comment) item.comment = input.comment;
    if (input.messageId) item.messageId = input.messageId;
    if (input.userId) item.userId = input.userId;
    if (input.runId) item.runId = input.runId;

    const result = await this.model.create(item as never);
    return this.toExternal(result as unknown as Record<string, unknown>);
  }

  async getById(id: string): Promise<Feedback | null> {
    const item = await this.model.get({ id } as never);
    if (!item) return null;
    return this.toExternal(item as unknown as Record<string, unknown>);
  }

  async getByConversationId(conversationId: string): Promise<Feedback[]> {
    const items = await this.model.find(
      { gsi1pk: `Feedback#${conversationId}` } as never,
      { index: "gsi1" } as never,
    );
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }
}
