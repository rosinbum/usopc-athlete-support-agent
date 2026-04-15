import type { Pool } from "pg";
import type {
  SportOrganization,
  OlympicProgram,
  OrgStatus,
  OrgType,
} from "../../types/sport-org.js";

export class SportOrgEntityPg {
  constructor(private pool: Pool) {}

  async create(input: SportOrganization): Promise<SportOrganization> {
    const { rows } = await this.pool.query(
      `INSERT INTO sport_organizations
         (id, type, official_name, abbreviation, sports, olympic_program,
          paralympic_managed, website_url, bylaws_url, selection_procedures_url,
          international_federation, aliases, keywords, status, effective_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        input.id,
        input.type,
        input.officialName,
        input.abbreviation ?? null,
        input.sports,
        input.olympicProgram,
        input.paralympicManaged,
        input.websiteUrl,
        input.bylawsUrl ?? null,
        input.selectionProceduresUrl ?? null,
        input.internationalFederation ?? null,
        input.aliases,
        input.keywords,
        input.status,
        input.effectiveDate,
      ],
    );
    return this.toExternal(rows[0]);
  }

  async getById(id: string): Promise<SportOrganization | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM sport_organizations WHERE id = $1",
      [id],
    );
    return rows.length > 0 ? this.toExternal(rows[0]) : null;
  }

  async getAll(): Promise<SportOrganization[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM sport_organizations ORDER BY official_name",
    );
    return rows.map((r) => this.toExternal(r));
  }

  async search(query: string): Promise<SportOrganization[]> {
    const pattern = `%${query}%`;
    const { rows } = await this.pool.query(
      `SELECT * FROM sport_organizations
       WHERE official_name ILIKE $1
          OR abbreviation ILIKE $1
          OR $2 = ANY(aliases)
          OR $2 = ANY(keywords)
       ORDER BY official_name`,
      [pattern, query.toLowerCase()],
    );
    return rows.map((r) => this.toExternal(r));
  }

  async update(
    id: string,
    updates: Partial<Omit<SportOrganization, "id">>,
  ): Promise<SportOrganization> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      type: "type",
      officialName: "official_name",
      abbreviation: "abbreviation",
      sports: "sports",
      olympicProgram: "olympic_program",
      paralympicManaged: "paralympic_managed",
      websiteUrl: "website_url",
      bylawsUrl: "bylaws_url",
      selectionProceduresUrl: "selection_procedures_url",
      internationalFederation: "international_federation",
      aliases: "aliases",
      keywords: "keywords",
      status: "status",
      effectiveDate: "effective_date",
    };

    for (const [key, col] of Object.entries(columnMap)) {
      if (key in updates) {
        setClauses.push(`${col} = $${idx}`);
        values.push((updates as Record<string, unknown>)[key]);
        idx++;
      }
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await this.pool.query(
      `UPDATE sport_organizations SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return this.toExternal(rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query("DELETE FROM sport_organizations WHERE id = $1", [
      id,
    ]);
  }

  private toExternal(row: Record<string, unknown>): SportOrganization {
    return {
      id: row.id as string,
      type: row.type as OrgType,
      officialName: row.official_name as string,
      abbreviation: (row.abbreviation as string) ?? undefined,
      sports: (row.sports as string[]) ?? [],
      olympicProgram: row.olympic_program as OlympicProgram | null,
      paralympicManaged: row.paralympic_managed as boolean,
      websiteUrl: row.website_url as string,
      bylawsUrl: (row.bylaws_url as string) ?? undefined,
      selectionProceduresUrl:
        (row.selection_procedures_url as string) ?? undefined,
      internationalFederation:
        (row.international_federation as string) ?? undefined,
      aliases: (row.aliases as string[]) ?? [],
      keywords: (row.keywords as string[]) ?? [],
      status: row.status as OrgStatus,
      effectiveDate: (row.effective_date as Date).toISOString(),
    };
  }
}
