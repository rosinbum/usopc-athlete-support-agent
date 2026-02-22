import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();

vi.mock("@usopc/shared", () => ({
  getPool: vi.fn(() => ({ query: mockQuery })),
  logger: {
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  },
}));

describe("GET /api/sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports GET handler", async () => {
    const { GET } = await import("./route.js");
    expect(GET).toBeDefined();
    expect(typeof GET).toBe("function");
  });

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const { GET } = await import("./route.js");
    const request = new Request("http://localhost/api/sources?action=stats");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });

  it("escapes ILIKE wildcard characters in search parameter", async () => {
    // count query returns 0 total
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const { GET } = await import("./route.js");
    const request = new Request(
      "http://localhost/api/sources?search=100%25_match",
    );
    await GET(request);

    // The count query (first call) receives the escaped search param
    const countParams = mockQuery.mock.calls[0]![1] as string[];
    const searchParam = countParams[0];
    expect(searchParam).toContain("\\%");
    expect(searchParam).toContain("\\_");
  });

  it("uses ESCAPE clause in ILIKE predicate", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const { GET } = await import("./route.js");
    const request = new Request("http://localhost/api/sources?search=bylaws");
    await GET(request);

    const countSql = mockQuery.mock.calls[0]![0] as string;
    expect(countSql).toContain("ESCAPE");
  });

  it("does not expose s3Key, ngbId, or chunkCount in response", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            source_url: "https://example.com/doc.pdf",
            document_title: "Test Doc",
            document_type: "policy",
            ngb_id: "usa-swimming",
            topic_domain: "governance",
            authority_level: "usopc_governance",
            effective_date: "2024-01-01",
            ingested_at: new Date("2024-06-15T00:00:00Z"),
            chunk_count: "42",
            s3_key: "sources/test/abc123.pdf",
          },
        ],
      });

    const { GET } = await import("./route.js");
    const request = new Request("http://localhost/api/sources");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.documents).toHaveLength(1);

    const doc = body.documents[0];
    expect(doc.sourceUrl).toBe("https://example.com/doc.pdf");
    expect(doc.documentTitle).toBe("Test Doc");
    expect(doc.ingestedAt).toBeDefined();
    // Internal fields must not be exposed
    expect(doc.s3Key).toBeUndefined();
    expect(doc.ngbId).toBeUndefined();
    expect(doc.chunkCount).toBeUndefined();
  });
});
