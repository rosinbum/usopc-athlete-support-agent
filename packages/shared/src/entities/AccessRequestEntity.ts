import type { Table } from "dynamodb-onetable";
import { createLogger } from "../index.js";
import type { AppTableSchema } from "./schema.js";

const logger = createLogger({ service: "access-request-entity" });

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export interface AccessRequest {
  email: string;
  name: string;
  sport?: string | undefined;
  role?: string | undefined;
  status: AccessRequestStatus;
  requestedAt: string;
  reviewedAt?: string | undefined;
  reviewedBy?: string | undefined;
}

export interface CreateAccessRequestInput {
  email: string;
  name: string;
  sport?: string | undefined;
  role?: string | undefined;
}

export class AccessRequestEntity {
  private model;

  constructor(table: Table<typeof AppTableSchema>) {
    this.model = table.getModel("AccessRequest");
  }

  private toExternal(item: Record<string, unknown>): AccessRequest {
    return {
      email: item.email as string,
      name: item.name as string,
      sport: item.sport as string | undefined,
      role: item.role as string | undefined,
      status: item.status as AccessRequestStatus,
      requestedAt: item.requestedAt as string,
      reviewedAt: item.reviewedAt as string | undefined,
      reviewedBy: item.reviewedBy as string | undefined,
    };
  }

  async get(email: string): Promise<AccessRequest | null> {
    const item = await this.model.get({ email } as never);
    if (!item) return null;
    return this.toExternal(item as unknown as Record<string, unknown>);
  }

  async create(input: CreateAccessRequestInput): Promise<AccessRequest> {
    const now = new Date().toISOString();
    const item: Record<string, unknown> = {
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      status: "pending",
      requestedAt: now,
    };
    if (input.sport) item.sport = input.sport;
    if (input.role) item.role = input.role;

    logger.info(`Creating access request for: ${input.email}`, {
      email: input.email,
      name: input.name,
    });

    const result = await this.model.create(item as never);
    return this.toExternal(result as unknown as Record<string, unknown>);
  }

  async updateStatus(
    email: string,
    status: AccessRequestStatus,
    reviewedBy?: string,
  ): Promise<AccessRequest | null> {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      email,
      status,
      reviewedAt: now,
    };
    if (reviewedBy) updates.reviewedBy = reviewedBy;

    logger.info(`Updating access request status for: ${email}`, {
      email,
      status,
      reviewedBy,
    });

    const result = await this.model.update(updates as never);
    if (!result) return null;
    return this.toExternal(result as unknown as Record<string, unknown>);
  }

  async getAll(): Promise<AccessRequest[]> {
    const items = await this.model.scan({} as never);
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }
}
