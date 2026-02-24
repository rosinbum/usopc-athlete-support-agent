import type { Table } from "dynamodb-onetable";
import { createLogger } from "../index.js";
import type { AppTableSchema } from "./schema.js";

const logger = createLogger({ service: "invite-entity" });

export interface Invite {
  email: string;
  invitedBy?: string | undefined;
  createdAt?: string | undefined;
}

export interface CreateInviteInput {
  email: string;
  invitedBy?: string | undefined;
}

export class InviteEntity {
  private model;

  constructor(table: Table<typeof AppTableSchema>) {
    this.model = table.getModel("Invite");
  }

  private toExternal(item: Record<string, unknown>): Invite {
    return {
      email: item.email as string,
      invitedBy: item.invitedBy as string | undefined,
      createdAt: item.createdAt as string | undefined,
    };
  }

  async get(email: string): Promise<Invite | null> {
    const item = await this.model.get({ email } as never);
    if (!item) return null;
    return this.toExternal(item as unknown as Record<string, unknown>);
  }

  async create(input: CreateInviteInput): Promise<Invite> {
    const now = new Date().toISOString();
    const item: Record<string, unknown> = {
      email: input.email.toLowerCase().trim(),
      createdAt: now,
    };
    if (input.invitedBy) item.invitedBy = input.invitedBy;

    logger.info(`Creating invite for: ${input.email}`, {
      email: input.email,
      invitedBy: input.invitedBy,
    });

    const result = await this.model.create(item as never);
    return this.toExternal(result as unknown as Record<string, unknown>);
  }

  async delete(email: string): Promise<void> {
    logger.info(`Deleting invite for: ${email}`, { email });
    await this.model.remove({ email } as never);
  }

  async getAll(): Promise<Invite[]> {
    const items = await this.model.scan({} as never);
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  async isInvited(email: string): Promise<boolean> {
    const invite = await this.get(email.toLowerCase().trim());
    return invite !== null;
  }
}
