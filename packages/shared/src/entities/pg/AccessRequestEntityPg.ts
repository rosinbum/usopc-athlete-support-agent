import type { Pool } from "pg";
import type {
  AccessRequest,
  AccessRequestStatus,
  CreateAccessRequestInput,
} from "../types.js";

export class AccessRequestEntityPg {
  constructor(private pool: Pool) {}

  async get(email: string): Promise<AccessRequest | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM access_requests WHERE email = $1",
      [email],
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  async create(input: CreateAccessRequestInput): Promise<AccessRequest> {
    const { rows } = await this.pool.query(
      `INSERT INTO access_requests (email, name, sport, role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.email, input.name, input.sport ?? null, input.role ?? null],
    );
    return this.toExternal(rows[0]);
  }

  async updateStatus(
    email: string,
    status: AccessRequestStatus,
    reviewedBy?: string,
  ): Promise<AccessRequest | null> {
    const { rows } = await this.pool.query(
      `UPDATE access_requests
       SET status = $2, reviewed_at = NOW(), reviewed_by = $3
       WHERE email = $1 RETURNING *`,
      [email, status, reviewedBy ?? null],
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  async getAll(): Promise<AccessRequest[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM access_requests ORDER BY requested_at DESC",
    );
    return rows.map((r) => this.toExternal(r));
  }

  private toExternal(row: Record<string, unknown>): AccessRequest {
    return {
      email: row.email as string,
      name: row.name as string,
      sport: (row.sport as string) ?? undefined,
      role: (row.role as string) ?? undefined,
      status: row.status as AccessRequestStatus,
      requestedAt: (row.requested_at as Date).toISOString(),
      reviewedAt: row.reviewed_at
        ? (row.reviewed_at as Date).toISOString()
        : undefined,
      reviewedBy: (row.reviewed_by as string) ?? undefined,
    };
  }
}
