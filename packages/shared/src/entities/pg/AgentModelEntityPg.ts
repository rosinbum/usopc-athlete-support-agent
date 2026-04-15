import type { Pool } from "pg";
import type { AgentModelConfig } from "../types.js";

export class AgentModelEntityPg {
  constructor(private pool: Pool) {}

  async get(id: string): Promise<AgentModelConfig | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM agent_models WHERE id = $1",
      [id],
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  async upsert(config: AgentModelConfig): Promise<AgentModelConfig> {
    const { rows } = await this.pool.query(
      `INSERT INTO agent_models (id, role, model, temperature, max_tokens, provider, dimensions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         role = EXCLUDED.role,
         model = EXCLUDED.model,
         temperature = EXCLUDED.temperature,
         max_tokens = EXCLUDED.max_tokens,
         provider = EXCLUDED.provider,
         dimensions = EXCLUDED.dimensions,
         updated_at = NOW()
       RETURNING *`,
      [
        config.id,
        config.role,
        config.model,
        config.temperature ?? null,
        config.maxTokens ?? null,
        config.provider ?? null,
        config.dimensions ?? null,
      ],
    );
    return this.toExternal(rows[0]);
  }

  async getAll(): Promise<AgentModelConfig[]> {
    const { rows } = await this.pool.query("SELECT * FROM agent_models");
    return rows.map((r) => this.toExternal(r));
  }

  private toExternal(row: Record<string, unknown>): AgentModelConfig {
    return {
      id: row.id as string,
      role: row.role as string,
      model: row.model as string,
      temperature: row.temperature as number | undefined,
      maxTokens: row.max_tokens as number | undefined,
      provider: row.provider as string | undefined,
      dimensions: row.dimensions as number | undefined,
      createdAt: (row.created_at as Date)?.toISOString(),
      updatedAt: (row.updated_at as Date)?.toISOString(),
    };
  }
}
