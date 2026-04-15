import type { Pool } from "pg";
import type { PromptConfig } from "../types.js";

export class PromptEntityPg {
  constructor(private pool: Pool) {}

  async get(name: string): Promise<PromptConfig | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM prompts WHERE name = $1",
      [name],
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  async upsert(
    config: Omit<PromptConfig, "createdAt" | "updatedAt">,
  ): Promise<PromptConfig> {
    const { rows } = await this.pool.query(
      `INSERT INTO prompts (name, content, domain, version)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         content = EXCLUDED.content,
         domain = EXCLUDED.domain,
         version = EXCLUDED.version,
         updated_at = NOW()
       RETURNING *`,
      [config.name, config.content, config.domain ?? null, config.version],
    );
    return this.toExternal(rows[0]);
  }

  async getAll(): Promise<PromptConfig[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM prompts ORDER BY name",
    );
    return rows.map((r) => this.toExternal(r));
  }

  async delete(name: string): Promise<void> {
    await this.pool.query("DELETE FROM prompts WHERE name = $1", [name]);
  }

  private toExternal(row: Record<string, unknown>): PromptConfig {
    return {
      name: row.name as string,
      content: row.content as string,
      domain: (row.domain as string) ?? undefined,
      version: row.version as number,
      createdAt: (row.created_at as Date)?.toISOString(),
      updatedAt: (row.updated_at as Date)?.toISOString(),
    };
  }
}
