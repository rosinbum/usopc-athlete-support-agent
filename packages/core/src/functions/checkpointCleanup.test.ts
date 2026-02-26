import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockEnd, mockGetDatabaseUrl } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
  mockEnd: vi.fn().mockResolvedValue(undefined),
  mockGetDatabaseUrl: vi
    .fn()
    .mockReturnValue("postgresql://localhost:5432/test"),
}));

vi.mock("pg", () => ({
  default: {
    Pool: vi.fn().mockImplementation(() => ({
      query: mockQuery,
      end: mockEnd,
    })),
  },
}));

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    getDatabaseUrl: mockGetDatabaseUrl,
    logger: {
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
  };
});

import { handler } from "./checkpointCleanup.js";

describe("checkpointCleanup handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: ensureCreatedAtColumn succeeds, then stale threads query returns threads
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // ALTER TABLE
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [{ thread_id: "t1" }, { thread_id: "t2" }],
      }) // stale threads
      .mockResolvedValueOnce({ rowCount: 3 }) // DELETE blobs
      .mockResolvedValueOnce({ rowCount: 5 }) // DELETE writes
      .mockResolvedValueOnce({ rowCount: 2 }); // DELETE checkpoints
  });

  it("ensures created_at column exists before querying", async () => {
    await handler();

    const [alterSql] = mockQuery.mock.calls[0]!;
    expect(alterSql).toContain("ALTER TABLE checkpoints");
    expect(alterSql).toContain("created_at");
  });

  it("finds stale threads using correct cutoff", async () => {
    await handler();

    // Second call: find stale threads
    const [sql, params] = mockQuery.mock.calls[1]!;
    expect(sql).toContain("SELECT DISTINCT thread_id FROM checkpoints");
    expect(sql).toContain("created_at >= $1");
    // Cutoff should be ~7 days ago
    const cutoff = new Date(params[0]);
    const daysDiff = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(6.9);
    expect(daysDiff).toBeLessThan(7.1);
  });

  it("deletes from all three tables by thread_id", async () => {
    await handler();

    // Calls 2-4: DELETE from blobs, writes, checkpoints
    expect(mockQuery).toHaveBeenCalledTimes(5);
    const [blobsSql, blobsParams] = mockQuery.mock.calls[2]!;
    expect(blobsSql).toContain("DELETE FROM checkpoint_blobs");
    expect(blobsParams).toEqual([["t1", "t2"]]);

    const [writesSql, writesParams] = mockQuery.mock.calls[3]!;
    expect(writesSql).toContain("DELETE FROM checkpoint_writes");
    expect(writesParams).toEqual([["t1", "t2"]]);

    const [checkpointsSql, checkpointsParams] = mockQuery.mock.calls[4]!;
    expect(checkpointsSql).toContain("DELETE FROM checkpoints");
    expect(checkpointsParams).toEqual([["t1", "t2"]]);
  });

  it("skips deletion when no stale threads found", async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // ALTER TABLE
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // no stale threads

    await handler();

    // Only 2 calls: ALTER TABLE + stale threads query (no DELETEs)
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("always calls pool.end()", async () => {
    await handler();

    expect(mockEnd).toHaveBeenCalledOnce();
  });

  it("calls pool.end() even on error", async () => {
    mockQuery.mockReset();
    mockQuery.mockRejectedValueOnce(new Error("DB down"));

    await expect(handler()).rejects.toThrow("DB down");
    expect(mockEnd).toHaveBeenCalledOnce();
  });
});
