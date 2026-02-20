import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "pg";
import {
  listUniqueDocuments,
  getSourcesStats,
  escapeIlike,
} from "./sources.js";

function createMockPool() {
  return { query: vi.fn() } as unknown as Pool & {
    query: ReturnType<typeof vi.fn>;
  };
}

describe("listUniqueDocuments", () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
  });

  it("returns grouped documents with correct shape", async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ total: "5" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            source_url: "https://example.com/doc1.pdf",
            document_title: "Test Document",
            document_type: "policy",
            ngb_id: "usa_swimming",
            topic_domain: "team_selection",
            authority_level: "ngb_policy_procedure",
            effective_date: "2024-01-01",
            ingested_at: new Date("2024-06-15T10:00:00Z"),
            chunk_count: "10",
          },
        ],
      });

    const result = await listUniqueDocuments(pool, {});

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toEqual({
      sourceUrl: "https://example.com/doc1.pdf",
      documentTitle: "Test Document",
      documentType: "policy",
      ngbId: "usa_swimming",
      topicDomain: "team_selection",
      authorityLevel: "ngb_policy_procedure",
      effectiveDate: "2024-01-01",
      ingestedAt: expect.any(String),
      chunkCount: 10,
    });
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);
  });

  it("applies search filter with ILIKE on document_title", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await listUniqueDocuments(pool, { search: "bylaws" });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE"),
      expect.arrayContaining(["%bylaws%"]),
    );
  });

  it("uses ESCAPE clause in ILIKE predicate to prevent wildcard injection", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await listUniqueDocuments(pool, { search: "bylaws" });

    const countCall = pool.query.mock.calls[0]!;
    expect(countCall[0]).toContain("ESCAPE");
  });

  it("escapes ILIKE wildcard characters in search input", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await listUniqueDocuments(pool, { search: "100%_match" });

    // Both count and data queries receive the escaped value
    const countParams = pool.query.mock.calls[0]![1] as string[];
    const searchParam = countParams[0];
    expect(searchParam).toContain("\\%");
    expect(searchParam).toContain("\\_");
  });

  it("queries denormalized columns directly", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await listUniqueDocuments(pool, {});

    const dataCall = pool.query.mock.calls[1]!;
    expect(dataCall[0]).toContain("source_url");
    expect(dataCall[0]).not.toContain("COALESCE");
  });

  it("count query uses subquery matching GROUP BY columns", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await listUniqueDocuments(pool, {});

    // First call is the count query - must use subquery with GROUP BY
    const countCall = pool.query.mock.calls[0]!;
    expect(countCall[0]).toContain("COUNT(*) as total FROM (");
    expect(countCall[0]).toContain("GROUP BY");
  });

  it("applies documentType filter", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await listUniqueDocuments(pool, { documentType: "policy" });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("document_type"),
      expect.arrayContaining(["policy"]),
    );
  });

  it("applies topicDomain filter", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await listUniqueDocuments(pool, { topicDomain: "safesport" });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("topic_domain"),
      expect.arrayContaining(["safesport"]),
    );
  });

  it("applies ngbId filter", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await listUniqueDocuments(pool, { ngbId: "usa_swimming" });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("ngb_id"),
      expect.arrayContaining(["usa_swimming"]),
    );
  });

  it("applies authorityLevel filter", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await listUniqueDocuments(pool, { authorityLevel: "law" });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("authority_level"),
      expect.arrayContaining(["law"]),
    );
  });

  it("applies pagination with LIMIT and OFFSET", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "50" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await listUniqueDocuments(pool, { page: 3, limit: 10 });

    // OFFSET = (page - 1) * limit = (3 - 1) * 10 = 20
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT"),
      expect.arrayContaining([10, 20]),
    );
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(5);
  });

  it("returns empty array when no documents", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await listUniqueDocuments(pool, {});

    expect(result.documents).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });
});

describe("escapeIlike", () => {
  it("passes through strings with no wildcards unchanged", () => {
    expect(escapeIlike("bylaws")).toBe("bylaws");
    expect(escapeIlike("hello world")).toBe("hello world");
    expect(escapeIlike("")).toBe("");
  });

  it("escapes percent signs", () => {
    expect(escapeIlike("100%")).toBe("100\\%");
    expect(escapeIlike("%start")).toBe("\\%start");
    expect(escapeIlike("mid%dle")).toBe("mid\\%dle");
  });

  it("escapes underscores", () => {
    expect(escapeIlike("_leading")).toBe("\\_leading");
    expect(escapeIlike("trail_")).toBe("trail\\_");
    expect(escapeIlike("mid_dle")).toBe("mid\\_dle");
  });

  it("escapes backslashes", () => {
    expect(escapeIlike("path\\to")).toBe("path\\\\to");
  });

  it("escapes multiple wildcard characters in one string", () => {
    expect(escapeIlike("100%_match\\path")).toBe("100\\%\\_match\\\\path");
  });
});

describe("getSourcesStats", () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
  });

  it("returns aggregated statistics", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          total_documents: "42",
          total_organizations: "15",
          last_ingested_at: new Date("2024-06-15T10:00:00Z"),
        },
      ],
    });

    const result = await getSourcesStats(pool);

    expect(result).toEqual({
      totalDocuments: 42,
      totalOrganizations: 15,
      lastIngestedAt: expect.any(String),
    });
  });

  it("returns null for lastIngestedAt when no documents", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          total_documents: "0",
          total_organizations: "0",
          last_ingested_at: null,
        },
      ],
    });

    const result = await getSourcesStats(pool);

    expect(result).toEqual({
      totalDocuments: 0,
      totalOrganizations: 0,
      lastIngestedAt: null,
    });
  });
});
