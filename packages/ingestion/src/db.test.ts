import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "pg";
import { getLastContentHash, upsertIngestionStatus } from "./db.js";

function createMockPool() {
  return { query: vi.fn() } as unknown as Pool & {
    query: ReturnType<typeof vi.fn>;
  };
}

describe("getLastContentHash", () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
  });

  it("returns hash when row exists", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ content_hash: "abc123" }],
    });

    const result = await getLastContentHash(pool, "source-1");

    expect(result).toBe("abc123");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT content_hash FROM ingestion_status"),
      ["source-1"],
    );
  });

  it("returns null when no rows", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await getLastContentHash(pool, "source-1");

    expect(result).toBeNull();
  });
});

describe("upsertIngestionStatus", () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [] });
  });

  it('calls INSERT with correct params for "ingesting"', async () => {
    await upsertIngestionStatus(
      pool,
      "src-1",
      "https://example.com",
      "ingesting",
    );

    expect(pool.query).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ingestion_status"),
      ["src-1", "https://example.com", "ingesting"],
    );
  });

  it('calls UPDATE with contentHash and chunksCount for "completed"', async () => {
    await upsertIngestionStatus(
      pool,
      "src-1",
      "https://example.com",
      "completed",
      {
        contentHash: "hash123",
        chunksCount: 42,
      },
    );

    expect(pool.query).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ingestion_status"),
      ["completed", "hash123", 42, "src-1"],
    );
  });

  it('calls UPDATE with errorMessage for "failed"', async () => {
    await upsertIngestionStatus(
      pool,
      "src-1",
      "https://example.com",
      "failed",
      {
        errorMessage: "something broke",
      },
    );

    expect(pool.query).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ingestion_status"),
      ["failed", "something broke", "src-1"],
    );
  });

  it('calls UPDATE with errorMessage for "quota_exceeded"', async () => {
    await upsertIngestionStatus(
      pool,
      "src-1",
      "https://example.com",
      "quota_exceeded",
      {
        errorMessage: "quota hit",
      },
    );

    expect(pool.query).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ingestion_status"),
      ["quota_exceeded", "quota hit", "src-1"],
    );
  });

  it("does not execute any query for unknown status", async () => {
    await upsertIngestionStatus(
      pool,
      "src-1",
      "https://example.com",
      "unknown_status",
    );

    expect(pool.query).not.toHaveBeenCalled();
  });
});
