import { Table } from "dynamodb-onetable";
import { createLogger } from "../index.js";
import type { AppTableSchema } from "./schema.js";

const logger = createLogger({ service: "prompt-entity" });

export interface PromptConfig {
  name: string;
  content: string;
  domain?: string | undefined;
  version: number;
  updatedAt?: string | undefined;
  createdAt?: string | undefined;
}

export class PromptEntity {
  private model;
  private table: Table<typeof AppTableSchema>;

  constructor(table: Table<typeof AppTableSchema>) {
    this.table = table;
    this.model = table.getModel("Prompt");
  }

  private toExternal(item: Record<string, unknown>): PromptConfig {
    return {
      name: item.name as string,
      content: item.content as string,
      domain: item.domain as string | undefined,
      version: (item.version as number) ?? 1,
      updatedAt: item.updatedAt as string | undefined,
      createdAt: item.createdAt as string | undefined,
    };
  }

  async get(name: string): Promise<PromptConfig | null> {
    const item = await this.model.get({ name } as never);
    if (!item) return null;
    return this.toExternal(item as unknown as Record<string, unknown>);
  }

  async upsert(
    config: Omit<PromptConfig, "createdAt" | "updatedAt">,
  ): Promise<PromptConfig> {
    const now = new Date().toISOString();
    const item: Record<string, unknown> = {
      name: config.name,
      content: config.content,
      version: config.version,
      updatedAt: now,
      createdAt: now,
    };
    if (config.domain) item.domain = config.domain;

    logger.info(`Upserting prompt: ${config.name}`, {
      promptName: config.name,
    });

    try {
      const result = await this.model.create(item as never, { exists: null });
      return this.toExternal(result as unknown as Record<string, unknown>);
    } catch {
      // Already exists — update (don't overwrite original createdAt)
      delete item.createdAt;
      const result = await this.model.update(item as never);
      return this.toExternal(result as unknown as Record<string, unknown>);
    }
  }

  async getAll(): Promise<PromptConfig[]> {
    const items = await this.model.scan({} as never);
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  async delete(name: string): Promise<void> {
    logger.info(`Deleting prompt: ${name}`, { promptName: name });
    await this.model.remove({ name } as never);
  }
}
