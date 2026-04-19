import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import { DiscoveredSourceEntityPg } from "./DiscoveredSourceEntityPg.js";

function makePool(): { pool: Pool; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockResolvedValue({
    rows: [
      {
        id: "abc",
        url: "https://example.com",
        title: "Example",
        discovery_method: "search",
        discovered_at: new Date(),
        discovered_from: null,
        status: "pending_metadata",
        metadata_confidence: null,
        content_confidence: null,
        combined_confidence: null,
        document_type: null,
        topic_domains: [],
        format: null,
        ngb_id: null,
        priority: null,
        description: null,
        authority_level: null,
        metadata_reasoning: null,
        content_reasoning: null,
        reviewed_at: null,
        reviewed_by: null,
        rejection_reason: null,
        source_config_id: null,
        last_error: null,
        error_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
  });
  return { pool: { query } as unknown as Pool, query };
}

describe("DiscoveredSourceEntityPg.create", () => {
  it("inserts status='pending_metadata' so the NOT NULL constraint is satisfied", async () => {
    const { pool, query } = makePool();
    const entity = new DiscoveredSourceEntityPg(pool);

    await entity.create({
      id: "abc",
      url: "https://example.com",
      title: "Example",
      discoveryMethod: "search",
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO discovered_sources/);
    expect(sql).toMatch(/status/);
    expect(sql).toMatch(/'pending_metadata'/);
  });
});
