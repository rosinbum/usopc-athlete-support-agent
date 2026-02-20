import { Table } from "dynamodb-onetable";
import { createLogger } from "../index.js";
import type { AppTableSchema } from "./schema.js";

const logger = createLogger({ service: "agent-model-entity" });

export interface AgentModelConfig {
  id: string; // "agent" | "classifier" | "embeddings"
  role: string; // description of what this model does
  model: string; // model name (e.g., "claude-sonnet-4-20250514")
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  dimensions?: number | undefined; // for embeddings only
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

export class AgentModelEntity {
  private model;
  private table: Table<typeof AppTableSchema>;

  constructor(table: Table<typeof AppTableSchema>) {
    this.table = table;
    this.model = table.getModel("AgentModel");
  }

  private toExternal(item: Record<string, unknown>): AgentModelConfig {
    return {
      id: item.id as string,
      role: item.role as string,
      model: item.model as string,
      temperature: item.temperature as number | undefined,
      maxTokens: item.maxTokens as number | undefined,
      dimensions: item.dimensions as number | undefined,
      createdAt: item.createdAt as string | undefined,
      updatedAt: item.updatedAt as string | undefined,
    };
  }

  async get(id: string): Promise<AgentModelConfig | null> {
    const item = await this.model.get({ id } as never);
    if (!item) return null;
    return this.toExternal(item as unknown as Record<string, unknown>);
  }

  async upsert(config: AgentModelConfig): Promise<AgentModelConfig> {
    const now = new Date().toISOString();
    const item: Record<string, unknown> = {
      id: config.id,
      role: config.role,
      model: config.model,
      updatedAt: now,
    };
    if (config.temperature !== undefined) item.temperature = config.temperature;
    if (config.maxTokens !== undefined) item.maxTokens = config.maxTokens;
    if (config.dimensions !== undefined) item.dimensions = config.dimensions;
    if (!config.createdAt) item.createdAt = now;
    else item.createdAt = config.createdAt;

    logger.info(`Upserting agent model config: ${config.id}`, {
      modelId: config.id,
    });

    // Use create with {exists: null} to avoid overwrite, fallback to update
    try {
      const result = await this.model.create(item as never, { exists: null });
      return this.toExternal(result as unknown as Record<string, unknown>);
    } catch {
      // Item already exists, update it
      const result = await this.model.update(item as never);
      return this.toExternal(result as unknown as Record<string, unknown>);
    }
  }

  async getAll(): Promise<AgentModelConfig[]> {
    const items = await this.model.scan({} as never);
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }
}
