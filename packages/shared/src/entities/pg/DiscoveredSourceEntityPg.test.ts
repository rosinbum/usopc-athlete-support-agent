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

describe("DiscoveredSourceEntityPg.markContentEvaluated", () => {
  const extracted = {
    documentType: "policy",
    topicDomains: ["governance"],
    authorityLevel: "usopc_governance",
    priority: "high" as const,
    description: "Test doc",
    ngbId: null,
    format: "html" as const,
  };

  it("sets status='approved' when combined confidence meets threshold", async () => {
    const { pool, query } = makePool();
    const entity = new DiscoveredSourceEntityPg(pool);

    await entity.markContentEvaluated(
      "abc",
      0.9,
      0.85,
      extracted,
      "Looks good",
      0.7,
    );

    const [, params] = query.mock.calls[0]!;
    expect(params![1]).toBe("approved");
    expect(params![12]).toBeNull(); // rejection_reason
  });

  // Regression for #706: below-threshold used to set status='pending_content',
  // which put the row back into REPROCESSABLE_STATUSES and looped forever.
  it("sets status='rejected' (not 'pending_content') when combined confidence is below threshold", async () => {
    const { pool, query } = makePool();
    const entity = new DiscoveredSourceEntityPg(pool);

    await entity.markContentEvaluated(
      "abc",
      0.4,
      0.5,
      extracted,
      "Low quality",
      0.7,
    );

    const [sql, params] = query.mock.calls[0]!;
    expect(params![1]).toBe("rejected");
    expect(params![12]).toMatch(/below threshold/);
    // Must stamp reviewed_at + reviewed_by='auto' so admin UI shows it as auto-reviewed
    expect(sql).toMatch(/reviewed_at = NOW\(\)/);
    expect(sql).toMatch(/reviewed_by = 'auto'/);
  });
});

describe("DiscoveredSourceEntityPg.getStuckPending", () => {
  it("selects pending_* rows whose updated_at is older than the threshold", async () => {
    const { pool, query } = makePool();
    const entity = new DiscoveredSourceEntityPg(pool);

    const results = await entity.getStuckPending(10);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/status IN \('pending_metadata', 'pending_content'\)/);
    expect(sql).toMatch(
      /updated_at < NOW\(\) - \(\$1 \|\| ' minutes'\)::interval/,
    );
    expect(sql).toMatch(/ORDER BY updated_at ASC/);
    expect(params).toEqual([10, 1000]);
    expect(results).toHaveLength(1);
  });

  it("honors a custom limit", async () => {
    const { pool, query } = makePool();
    const entity = new DiscoveredSourceEntityPg(pool);

    await entity.getStuckPending(30, { limit: 50 });

    const [, params] = query.mock.calls[0]!;
    expect(params).toEqual([30, 50]);
  });
});
