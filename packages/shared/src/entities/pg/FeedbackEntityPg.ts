import type { Pool } from "pg";
import type { Feedback, CreateFeedbackInput } from "../types.js";

export class FeedbackEntityPg {
  constructor(private pool: Pool) {}

  async create(input: CreateFeedbackInput): Promise<Feedback> {
    const { rows } = await this.pool.query(
      `INSERT INTO conversation_feedback (conversation_id, channel, score, comment, message_id, user_id, run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        input.conversationId,
        input.channel,
        input.score,
        input.comment ?? null,
        input.messageId ?? null,
        input.userId ?? null,
        input.runId ?? null,
      ],
    );
    return this.toExternal(rows[0]);
  }

  async getById(id: string): Promise<Feedback | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM conversation_feedback WHERE id = $1",
      [id],
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  async getByConversationId(conversationId: string): Promise<Feedback[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM conversation_feedback WHERE conversation_id = $1 ORDER BY created_at DESC",
      [conversationId],
    );
    return rows.map((r) => this.toExternal(r));
  }

  private toExternal(row: Record<string, unknown>): Feedback {
    return {
      id: row.id as string,
      conversationId: row.conversation_id as string,
      channel: row.channel as "slack" | "web",
      score: row.score as number,
      comment: (row.comment as string) ?? undefined,
      messageId: (row.message_id as string) ?? undefined,
      userId: (row.user_id as string) ?? undefined,
      runId: (row.run_id as string) ?? undefined,
      createdAt: (row.created_at as Date)?.toISOString(),
    };
  }
}
