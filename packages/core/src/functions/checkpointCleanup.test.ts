import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockEnd, mockGetDatabaseUrl } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue({ rowCount: 5 }),
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
    mockQuery.mockResolvedValue({ rowCount: 5 });
  });

  it("deletes old checkpoints using correct cutoff", async () => {
    await handler();

    expect(mockQuery).toHaveBeenCalledTimes(3);
    // First call: DELETE from checkpoints
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain("DELETE FROM checkpoints");
    expect(sql).toContain("created_at");
    // Cutoff should be ~7 days ago
    const cutoff = new Date(params[0]);
    const daysDiff = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(6.9);
    expect(daysDiff).toBeLessThan(7.1);
  });

  it("cleans up orphaned checkpoint_writes", async () => {
    await handler();

    const [sql] = mockQuery.mock.calls[1]!;
    expect(sql).toContain("DELETE FROM checkpoint_writes");
  });

  it("cleans up orphaned checkpoint_blobs", async () => {
    await handler();

    const [sql] = mockQuery.mock.calls[2]!;
    expect(sql).toContain("DELETE FROM checkpoint_blobs");
  });

  it("always calls pool.end()", async () => {
    await handler();

    expect(mockEnd).toHaveBeenCalledOnce();
  });

  it("calls pool.end() even on error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));

    await expect(handler()).rejects.toThrow("DB down");
    expect(mockEnd).toHaveBeenCalledOnce();
  });
});
