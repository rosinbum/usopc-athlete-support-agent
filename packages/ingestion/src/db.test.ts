import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLastContentHash, upsertIngestionStatus } from "./db.js";
import type { IngestionLogEntity } from "./entities/index.js";

function createMockEntity() {
  return {
    create: vi.fn(),
    getForSource: vi.fn(),
    getRecent: vi.fn(),
    updateStatus: vi.fn(),
    getLastContentHash: vi.fn(),
  } as unknown as IngestionLogEntity & {
    create: ReturnType<typeof vi.fn>;
    getForSource: ReturnType<typeof vi.fn>;
    getRecent: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    getLastContentHash: ReturnType<typeof vi.fn>;
  };
}

describe("getLastContentHash", () => {
  let entity: ReturnType<typeof createMockEntity>;

  beforeEach(() => {
    entity = createMockEntity();
  });

  it("returns hash when a completed ingestion exists", async () => {
    entity.getLastContentHash.mockResolvedValueOnce("abc123");

    const result = await getLastContentHash(entity, "source-1");

    expect(result).toBe("abc123");
    expect(entity.getLastContentHash).toHaveBeenCalledWith("source-1");
  });

  it("returns null when no completed ingestions exist", async () => {
    entity.getLastContentHash.mockResolvedValueOnce(null);

    const result = await getLastContentHash(entity, "source-1");

    expect(result).toBeNull();
  });
});

describe("upsertIngestionStatus", () => {
  let entity: ReturnType<typeof createMockEntity>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
    entity = createMockEntity();
  });

  it('creates a new log with status "in_progress" for "ingesting"', async () => {
    entity.create.mockResolvedValueOnce({});

    await upsertIngestionStatus(
      entity,
      "src-1",
      "https://example.com",
      "ingesting",
    );

    expect(entity.create).toHaveBeenCalledWith({
      sourceId: "src-1",
      sourceUrl: "https://example.com",
      status: "in_progress",
    });
  });

  it('updates latest log to "completed" with fields', async () => {
    entity.getForSource.mockResolvedValueOnce([
      { startedAt: "2024-01-15T11:00:00.000Z" },
    ]);
    entity.updateStatus.mockResolvedValueOnce(undefined);

    await upsertIngestionStatus(
      entity,
      "src-1",
      "https://example.com",
      "completed",
      {
        contentHash: "hash123",
        chunksCount: 42,
      },
    );

    expect(entity.getForSource).toHaveBeenCalledWith("src-1", 1);
    expect(entity.updateStatus).toHaveBeenCalledWith(
      "src-1",
      "2024-01-15T11:00:00.000Z",
      "completed",
      {
        contentHash: "hash123",
        chunksCount: 42,
        completedAt: "2024-01-15T12:00:00.000Z",
        errorMessage: undefined,
      },
    );
  });

  it('updates latest log to "failed" with error message', async () => {
    entity.getForSource.mockResolvedValueOnce([
      { startedAt: "2024-01-15T11:00:00.000Z" },
    ]);
    entity.updateStatus.mockResolvedValueOnce(undefined);

    await upsertIngestionStatus(
      entity,
      "src-1",
      "https://example.com",
      "failed",
      {
        errorMessage: "something broke",
      },
    );

    expect(entity.updateStatus).toHaveBeenCalledWith(
      "src-1",
      "2024-01-15T11:00:00.000Z",
      "failed",
      {
        errorMessage: "something broke",
        completedAt: "2024-01-15T12:00:00.000Z",
      },
    );
  });

  it('maps "quota_exceeded" to "failed" with default error message', async () => {
    entity.getForSource.mockResolvedValueOnce([
      { startedAt: "2024-01-15T11:00:00.000Z" },
    ]);
    entity.updateStatus.mockResolvedValueOnce(undefined);

    await upsertIngestionStatus(
      entity,
      "src-1",
      "https://example.com",
      "quota_exceeded",
    );

    expect(entity.updateStatus).toHaveBeenCalledWith(
      "src-1",
      "2024-01-15T11:00:00.000Z",
      "failed",
      {
        completedAt: "2024-01-15T12:00:00.000Z",
        errorMessage: "Quota exceeded",
      },
    );
  });

  it('maps "quota_exceeded" with custom error message', async () => {
    entity.getForSource.mockResolvedValueOnce([
      { startedAt: "2024-01-15T11:00:00.000Z" },
    ]);
    entity.updateStatus.mockResolvedValueOnce(undefined);

    await upsertIngestionStatus(
      entity,
      "src-1",
      "https://example.com",
      "quota_exceeded",
      { errorMessage: "quota hit" },
    );

    expect(entity.updateStatus).toHaveBeenCalledWith(
      "src-1",
      "2024-01-15T11:00:00.000Z",
      "failed",
      {
        completedAt: "2024-01-15T12:00:00.000Z",
        errorMessage: "quota hit",
      },
    );
  });

  it("does nothing when no existing log found for update status", async () => {
    entity.getForSource.mockResolvedValueOnce([]);

    await upsertIngestionStatus(
      entity,
      "src-1",
      "https://example.com",
      "completed",
      { contentHash: "hash123" },
    );

    expect(entity.updateStatus).not.toHaveBeenCalled();
  });
});
