import type { Pool } from "pg";
import type { Invite, CreateInviteInput } from "../types.js";

export class InviteEntityPg {
  constructor(private pool: Pool) {}

  async get(email: string): Promise<Invite | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM invites WHERE email = $1",
      [email],
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  async create(input: CreateInviteInput): Promise<Invite> {
    const { rows } = await this.pool.query(
      `INSERT INTO invites (email, invited_by) VALUES ($1, $2) RETURNING *`,
      [input.email, input.invitedBy ?? null],
    );
    return this.toExternal(rows[0]);
  }

  async delete(email: string): Promise<void> {
    await this.pool.query("DELETE FROM invites WHERE email = $1", [email]);
  }

  async getAll(): Promise<Invite[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM invites ORDER BY created_at DESC",
    );
    return rows.map((r) => this.toExternal(r));
  }

  async isInvited(email: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      "SELECT 1 FROM invites WHERE email = $1",
      [email],
    );
    return rows.length > 0;
  }

  private toExternal(row: Record<string, unknown>): Invite {
    return {
      email: row.email as string,
      invitedBy: (row.invited_by as string) ?? undefined,
      createdAt: (row.created_at as Date)?.toISOString(),
    };
  }
}
