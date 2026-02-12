import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, QueryResult } from "pg";
import {
  deleteChunksBySourceId,
  updateChunkMetadataBySourceId,
  countChunksBySourceId,
} from "./chunks.js";

// ---------------------------------------------------------------------------
// Mock pool
// ---------------------------------------------------------------------------

function createMockPool(queryResult: Partial<QueryResult> = {}) {
  return {
    query: vi.fn().mockResolvedValue({
      rowCount: 0,
      rows: [],
      ...queryResult,
    }),
  } as unknown as Pool;
}

describe("deleteChunksBySourceId", () => {
  it("deletes chunks and returns row count", async () => {
    const pool = createMockPool({ rowCount: 5 });

    const count = await deleteChunksBySourceId(pool, "test-source");

    expect(count).toBe(5);
    expect(pool.query).toHaveBeenCalledWith(
      `DELETE FROM document_chunks WHERE metadata->>'sourceId' = $1`,
      ["test-source"],
    );
  });

  it("returns 0 when no chunks exist", async () => {
    const pool = createMockPool({ rowCount: 0 });

    const count = await deleteChunksBySourceId(pool, "missing-source");

    expect(count).toBe(0);
  });

  it("returns 0 when rowCount is null", async () => {
    const pool = createMockPool({ rowCount: null });

    const count = await deleteChunksBySourceId(pool, "test-source");

    expect(count).toBe(0);
  });
});

describe("updateChunkMetadataBySourceId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates title in metadata and column", async () => {
    const pool = createMockPool({ rowCount: 3 });

    const count = await updateChunkMetadataBySourceId(pool, "src-1", {
      title: "New Title",
    });

    expect(count).toBe(3);
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain("metadata = metadata || $2::jsonb");
    expect(call[0]).toContain("document_title =");
    expect(call[1]).toContain("src-1");
    // jsonb patch should include documentTitle
    const jsonbPatch = JSON.parse(call[1]![1] as string);
    expect(jsonbPatch.documentTitle).toBe("New Title");
  });

  it("updates topicDomains with primary domain", async () => {
    const pool = createMockPool({ rowCount: 2 });

    await updateChunkMetadataBySourceId(pool, "src-1", {
      topicDomains: ["governance", "eligibility"],
    });

    const call = vi.mocked(pool.query).mock.calls[0];
    const jsonbPatch = JSON.parse(call[1]![1] as string);
    expect(jsonbPatch.topicDomain).toBe("governance");
    expect(jsonbPatch.topicDomains).toEqual(["governance", "eligibility"]);
    expect(call[0]).toContain("topic_domain =");
  });

  it("updates multiple fields at once", async () => {
    const pool = createMockPool({ rowCount: 10 });

    await updateChunkMetadataBySourceId(pool, "src-1", {
      title: "Updated",
      ngbId: "usa-swimming",
      authorityLevel: "ngb_policy_procedure",
    });

    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain("document_title =");
    expect(call[0]).toContain("ngb_id =");
    expect(call[0]).toContain("authority_level =");
    const jsonbPatch = JSON.parse(call[1]![1] as string);
    expect(jsonbPatch.documentTitle).toBe("Updated");
    expect(jsonbPatch.ngbId).toBe("usa-swimming");
    expect(jsonbPatch.authorityLevel).toBe("ngb_policy_procedure");
  });

  it("returns 0 when updates is empty", async () => {
    const pool = createMockPool();

    const count = await updateChunkMetadataBySourceId(pool, "src-1", {});

    expect(count).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("handles null ngbId", async () => {
    const pool = createMockPool({ rowCount: 1 });

    await updateChunkMetadataBySourceId(pool, "src-1", {
      ngbId: null,
    });

    const call = vi.mocked(pool.query).mock.calls[0];
    const jsonbPatch = JSON.parse(call[1]![1] as string);
    expect(jsonbPatch.ngbId).toBeNull();
  });
});

describe("countChunksBySourceId", () => {
  it("returns the count", async () => {
    const pool = createMockPool({ rows: [{ count: 42 }] });

    const count = await countChunksBySourceId(pool, "src-1");

    expect(count).toBe(42);
    expect(pool.query).toHaveBeenCalledWith(
      `SELECT COUNT(*)::int AS count FROM document_chunks WHERE metadata->>'sourceId' = $1`,
      ["src-1"],
    );
  });

  it("returns 0 for empty result", async () => {
    const pool = createMockPool({ rows: [] });

    const count = await countChunksBySourceId(pool, "missing");

    expect(count).toBe(0);
  });
});
