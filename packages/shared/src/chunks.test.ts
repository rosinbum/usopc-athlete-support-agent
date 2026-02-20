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
    const call = vi.mocked(pool.query).mock.calls[0]!;
    expect(call[0]).toContain("metadata = metadata || $2::jsonb");
    expect(call[0]).toContain("document_title =");
    expect(call[1]).toContain("src-1");
    // jsonb patch should include documentTitle
    const jsonbPatch = JSON.parse(call[1]![1] as string);
    expect(jsonbPatch.documentTitle).toBe("New Title");
  });

  it("uses $1 for sourceId and $2 for jsonbPatch in WHERE and SET respectively", async () => {
    const pool = createMockPool({ rowCount: 1 });

    await updateChunkMetadataBySourceId(pool, "src-1", { title: "T" });

    const [sql, params] = vi.mocked(pool.query).mock.calls[0]!;
    // $1 is sourceId in WHERE
    expect(sql).toContain("WHERE metadata->>'sourceId' = $1");
    expect(params![0]).toBe("src-1");
    // $2 is jsonbPatch in SET
    expect(sql).toContain("metadata = metadata || $2::jsonb");
    expect(JSON.parse(params![1] as string)).toMatchObject({
      documentTitle: "T",
    });
    // $3 is the first extra column value
    expect(sql).toContain("document_title = $3");
    expect(params![2]).toBe("T");
  });

  it("assigns consecutive $N placeholders to each extra column", async () => {
    const pool = createMockPool({ rowCount: 2 });

    await updateChunkMetadataBySourceId(pool, "src-1", {
      title: "T",
      documentType: "policy",
    });

    const [sql, params] = vi.mocked(pool.query).mock.calls[0]!;
    // Extra columns start at $3 and go up sequentially
    expect(sql).toContain("document_title = $3");
    expect(sql).toContain("document_type = $4");
    expect(params![2]).toBe("T");
    expect(params![3]).toBe("policy");
  });

  it("updates topicDomains with primary domain", async () => {
    const pool = createMockPool({ rowCount: 2 });

    await updateChunkMetadataBySourceId(pool, "src-1", {
      topicDomains: ["governance", "eligibility"],
    });

    const call = vi.mocked(pool.query).mock.calls[0]!;
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

    const call = vi.mocked(pool.query).mock.calls[0]!;
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

    const call = vi.mocked(pool.query).mock.calls[0]!;
    const jsonbPatch = JSON.parse(call[1]![1] as string);
    expect(jsonbPatch.ngbId).toBeNull();
  });

  it("all 5 fields produce correct param indices ($1=sourceId $2=patch $3-$7=columns)", async () => {
    const pool = createMockPool({ rowCount: 5 });

    await updateChunkMetadataBySourceId(pool, "src-all", {
      title: "Title",
      documentType: "policy",
      topicDomains: ["safesport"],
      ngbId: "usa-track",
      authorityLevel: "law",
    });

    const [sql, params] = vi.mocked(pool.query).mock.calls[0]!;

    // WHERE uses $1
    expect(sql).toContain("WHERE metadata->>'sourceId' = $1");
    expect(params![0]).toBe("src-all");

    // SET uses $2 for jsonbPatch
    expect(sql).toContain("metadata = metadata || $2::jsonb");

    // Extra columns assigned $3–$7 in field order
    expect(sql).toContain("document_title = $3");
    expect(sql).toContain("document_type = $4");
    expect(sql).toContain("topic_domain = $5");
    expect(sql).toContain("ngb_id = $6");
    expect(sql).toContain("authority_level = $7");

    expect(params).toHaveLength(7);
    expect(params![2]).toBe("Title");
    expect(params![3]).toBe("policy");
    expect(params![4]).toBe("safesport");
    expect(params![5]).toBe("usa-track");
    expect(params![6]).toBe("law");
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
