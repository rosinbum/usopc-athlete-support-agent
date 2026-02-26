import { describe, it, expect, vi, beforeEach } from "vitest";
import { bm25Search } from "./bm25Search.js";

function makeMockPool(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as import("pg").Pool;
}

describe("bm25Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ranked text results", async () => {
    const pool = makeMockPool([
      {
        id: "chunk-1",
        content: "Section 220522 requirements",
        metadata: { topicDomain: "governance" },
        rank: 0.85,
      },
      {
        id: "chunk-2",
        content: "Athlete eligibility rules",
        metadata: { topicDomain: "eligibility" },
        rank: 0.42,
      },
    ]);

    const results = await bm25Search(pool, { query: "Section 220522" });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "chunk-1",
      content: "Section 220522 requirements",
      metadata: { topicDomain: "governance" },
      textRank: 0.85,
    });
    expect(results[1]!.textRank).toBe(0.42);

    const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sql = call[0] as string;
    expect(sql).toContain("plainto_tsquery");
    expect(sql).toContain("ts_rank_cd");
  });

  it("applies ngbId filter with single value", async () => {
    const pool = makeMockPool([]);

    await bm25Search(pool, {
      query: "team selection",
      filter: { ngbIds: ["usa-swimming"] },
    });

    const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sql = call[0] as string;
    const params = call[1] as unknown[];
    expect(sql).toContain("ngb_id = ANY($2)");
    expect(params[1]).toEqual(["usa-swimming"]);
  });

  it("applies ngbId filter with multiple values", async () => {
    const pool = makeMockPool([]);

    await bm25Search(pool, {
      query: "team selection",
      filter: { ngbIds: ["usa-swimming", "usa-track-field"] },
    });

    const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const params = call[1] as unknown[];
    expect(params[1]).toEqual(["usa-swimming", "usa-track-field"]);
  });

  it("applies topicDomain filter", async () => {
    const pool = makeMockPool([]);

    await bm25Search(pool, {
      query: "eligibility",
      filter: { topicDomain: "team_selection" },
    });

    const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sql = call[0] as string;
    const params = call[1] as unknown[];
    expect(sql).toContain("topic_domain = $2");
    expect(params[1]).toBe("team_selection");
  });

  it("returns empty array when no matches", async () => {
    const pool = makeMockPool([]);

    const results = await bm25Search(pool, { query: "nonexistent" });

    expect(results).toEqual([]);
  });

  it("returns empty array for empty query", async () => {
    const pool = makeMockPool();

    const results = await bm25Search(pool, { query: "   " });

    expect(results).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("handles combined filters", async () => {
    const pool = makeMockPool([]);

    await bm25Search(pool, {
      query: "doping rules",
      filter: { ngbIds: ["usa-swimming"], topicDomain: "anti_doping" },
    });

    const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sql = call[0] as string;
    const params = call[1] as unknown[];
    expect(sql).toContain("ngb_id = ANY($2)");
    expect(sql).toContain("topic_domain = $3");
    expect(params[1]).toEqual(["usa-swimming"]);
    expect(params[2]).toBe("anti_doping");
  });

  it("respects custom k parameter", async () => {
    const pool = makeMockPool([]);

    await bm25Search(pool, { query: "test", k: 5 });

    const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const params = call[1] as unknown[];
    // k is the last param
    expect(params[params.length - 1]).toBe(5);
  });

  it("handles null metadata in rows", async () => {
    const pool = makeMockPool([
      { id: "chunk-1", content: "some content", metadata: null, rank: 0.5 },
    ]);

    const results = await bm25Search(pool, { query: "content" });

    expect(results[0]!.metadata).toEqual({});
  });
});
