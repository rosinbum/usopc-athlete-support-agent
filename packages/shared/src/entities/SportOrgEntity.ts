import { Table } from "dynamodb-onetable";
import { createLogger } from "../index.js";
import type { AppTableSchema } from "./schema.js";

const logger = createLogger({ service: "sport-org-entity" });

// Re-export the types from shared
export type {
  OlympicProgram,
  OrgStatus,
  OrgType,
  SportOrganization,
} from "../types/sport-org.js";
import type { SportOrganization, OlympicProgram } from "../types/sport-org.js";

// ---------------------------------------------------------------------------
// SportOrgEntity — backed by dynamodb-onetable
// ---------------------------------------------------------------------------

/**
 * Entity class for managing sport organizations in DynamoDB
 * using the OneTable single-table pattern.
 *
 * Table structure:
 * - PK: SportOrg#{id}
 * - SK: Profile
 */
export class SportOrgEntity {
  private model;
  private table: Table<typeof AppTableSchema>;

  constructor(table: Table<typeof AppTableSchema>) {
    this.table = table;
    this.model = table.getModel("SportOrganization");
  }

  // ---------------------------------------------------------------------------
  // Marshalling
  // ---------------------------------------------------------------------------

  /**
   * Convert a OneTable item (undefined for absent optional fields) to the
   * external API shape (null for olympicProgram when absent, defaults for arrays).
   */
  private toExternal(item: Record<string, unknown>): SportOrganization {
    return {
      id: item.id as string,
      type: item.type as SportOrganization["type"],
      officialName: item.officialName as string,
      abbreviation: item.abbreviation as string | undefined,
      sports: (item.sports as string[]) ?? [],
      olympicProgram: (item.olympicProgram as OlympicProgram) ?? null,
      paralympicManaged: (item.paralympicManaged as boolean) ?? false,
      websiteUrl: item.websiteUrl as string,
      bylawsUrl: item.bylawsUrl as string | undefined,
      selectionProceduresUrl: item.selectionProceduresUrl as string | undefined,
      internationalFederation: item.internationalFederation as
        | string
        | undefined,
      aliases: (item.aliases as string[]) ?? [],
      keywords: (item.keywords as string[]) ?? [],
      status: item.status as SportOrganization["status"],
      effectiveDate: item.effectiveDate as string,
    };
  }

  /**
   * Convert external SportOrganization input to OneTable-compatible properties.
   * - null olympicProgram -> removed (OneTable omits undefined fields when nulls: false)
   * - undefined optional fields -> removed
   */
  private toInternal(
    config: Partial<SportOrganization>,
  ): Record<string, unknown> {
    const item: Record<string, unknown> = { ...config };
    // Remove null values — OneTable uses undefined/omission for absent fields
    for (const key of Object.keys(item)) {
      if (item[key] === null || item[key] === undefined) {
        delete item[key];
      }
    }
    return item;
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new sport organization.
   */
  async create(input: SportOrganization): Promise<SportOrganization> {
    const now = new Date().toISOString();

    logger.info(`Creating sport organization: ${input.id}`, {
      orgId: input.id,
    });

    const internal = this.toInternal(input);
    internal.createdAt = now;
    internal.updatedAt = now;

    await this.model.create(internal as never, {
      exists: null,
    });
    return input;
  }

  /**
   * Get a sport organization by ID.
   */
  async getById(id: string): Promise<SportOrganization | null> {
    const item = await this.model.get({ id } as never);
    if (!item) return null;
    return this.toExternal(item as unknown as Record<string, unknown>);
  }

  /**
   * Get all sport organizations.
   * OneTable handles pagination internally.
   */
  async getAll(): Promise<SportOrganization[]> {
    const items = await this.model.scan({} as never);
    return items.map((item) =>
      this.toExternal(item as unknown as Record<string, unknown>),
    );
  }

  /**
   * Search sport organizations by query string.
   * Gets all orgs and filters in memory (small dataset).
   * Matches against: officialName, abbreviation, sports, aliases, keywords.
   * Case-insensitive contains matching.
   */
  async search(query: string): Promise<SportOrganization[]> {
    const orgs = await this.getAll();
    const q = query.toLowerCase();

    return orgs.filter(
      (org) =>
        org.officialName.toLowerCase().includes(q) ||
        (org.abbreviation && org.abbreviation.toLowerCase().includes(q)) ||
        org.sports.some((s) => s.toLowerCase().includes(q)) ||
        org.aliases.some((a) => a.toLowerCase().includes(q)) ||
        org.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }

  /**
   * Update a sport organization.
   */
  async update(
    id: string,
    updates: Partial<Omit<SportOrganization, "id">>,
  ): Promise<SportOrganization> {
    const now = new Date().toISOString();
    const internal = this.toInternal({ ...updates });
    internal.updatedAt = now;
    const result = await this.model.update({ id, ...internal } as never);
    return this.toExternal(result as unknown as Record<string, unknown>);
  }

  /**
   * Delete a sport organization.
   */
  async delete(id: string): Promise<void> {
    logger.info(`Deleting sport organization: ${id}`, { orgId: id });
    await this.model.remove({ id } as never);
  }
}
