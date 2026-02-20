import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

// Create mock model methods
const mockCreate = vi.fn();
const mockGet = vi.fn();
const mockFind = vi.fn();
const mockScan = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();

const mockModel = {
  create: mockCreate,
  get: mockGet,
  find: mockFind,
  scan: mockScan,
  update: mockUpdate,
  remove: mockRemove,
};

// Mock Table that returns our mock model
const mockTable = {
  getModel: vi.fn(() => mockModel),
} as unknown;

// Import after mocks
import { IngestionLogEntity, type IngestionLog } from "./IngestionLogEntity.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function internalItem(overrides: Record<string, unknown> = {}) {
  return {
    sourceId: "usopc-bylaws",
    sourceUrl: "https://example.com/bylaws.pdf",
    status: "in_progress",
    startedAt: "2024-01-15T12:00:00.000Z",
    createdAt: "2024-01-15T12:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IngestionLogEntity", () => {
  let entity: IngestionLogEntity;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
    entity = new IngestionLogEntity(mockTable as never);
  });

  describe("create", () => {
    it("creates a new ingestion log entry and returns external shape", async () => {
      mockCreate.mockResolvedValueOnce(
        internalItem({
          sourceId: "usopc-bylaws",
          sourceUrl: "https://example.com/bylaws.pdf",
          status: "in_progress",
          startedAt: "2024-01-15T12:00:00.000Z",
          createdAt: "2024-01-15T12:00:00.000Z",
        }),
      );

      const result = await entity.create({
        sourceId: "usopc-bylaws",
        sourceUrl: "https://example.com/bylaws.pdf",
        status: "in_progress",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: "usopc-bylaws",
          sourceUrl: "https://example.com/bylaws.pdf",
          status: "in_progress",
          startedAt: "2024-01-15T12:00:00.000Z",
          createdAt: "2024-01-15T12:00:00.000Z",
        }),
      );

      expect(result.sourceId).toBe("usopc-bylaws");
      expect(result.sourceUrl).toBe("https://example.com/bylaws.pdf");
      expect(result.status).toBe("in_progress");
      expect(result.startedAt).toBe("2024-01-15T12:00:00.000Z");
      expect(result.createdAt).toBe("2024-01-15T12:00:00.000Z");
    });

    it("includes optional fields when provided", async () => {
      mockCreate.mockResolvedValueOnce(
        internalItem({
          contentHash: "abc123",
          chunksCount: 5,
          errorMessage: "some error",
        }),
      );

      await entity.create({
        sourceId: "usopc-bylaws",
        sourceUrl: "https://example.com/bylaws.pdf",
        status: "failed",
        contentHash: "abc123",
        chunksCount: 5,
        errorMessage: "some error",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          contentHash: "abc123",
          chunksCount: 5,
          errorMessage: "some error",
        }),
      );
    });

    it("omits optional fields when not provided", async () => {
      mockCreate.mockResolvedValueOnce(internalItem());

      await entity.create({
        sourceId: "usopc-bylaws",
        sourceUrl: "https://example.com/bylaws.pdf",
        status: "in_progress",
      });

      const createArg = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(createArg.contentHash).toBeUndefined();
      expect(createArg.chunksCount).toBeUndefined();
      expect(createArg.errorMessage).toBeUndefined();
    });
  });

  describe("getForSource", () => {
    it("returns logs for a specific source in reverse order", async () => {
      mockFind.mockResolvedValueOnce([
        internalItem({ startedAt: "2024-01-15T12:00:00.000Z" }),
        internalItem({ startedAt: "2024-01-14T12:00:00.000Z" }),
      ]);

      const results = await entity.getForSource("usopc-bylaws");

      expect(results).toHaveLength(2);
      expect(mockFind).toHaveBeenCalledWith(
        { sourceId: "usopc-bylaws" },
        { reverse: true, limit: 10 },
      );
    });

    it("respects custom limit", async () => {
      mockFind.mockResolvedValueOnce([internalItem()]);

      await entity.getForSource("usopc-bylaws", 5);

      expect(mockFind).toHaveBeenCalledWith(
        { sourceId: "usopc-bylaws" },
        { reverse: true, limit: 5 },
      );
    });

    it("returns empty array when no logs exist", async () => {
      mockFind.mockResolvedValueOnce([]);

      const results = await entity.getForSource("nonexistent");

      expect(results).toEqual([]);
    });
  });

  describe("getRecent", () => {
    it("queries gsi1 index for recent logs across all sources", async () => {
      mockFind.mockResolvedValueOnce([
        internalItem({ sourceId: "src1" }),
        internalItem({ sourceId: "src2" }),
      ]);

      const results = await entity.getRecent();

      expect(results).toHaveLength(2);
      expect(mockFind).toHaveBeenCalledWith(
        { gsi1pk: "Ingest" },
        { index: "gsi1", reverse: true, limit: 20 },
      );
    });

    it("respects custom limit", async () => {
      mockFind.mockResolvedValueOnce([]);

      await entity.getRecent(5);

      expect(mockFind).toHaveBeenCalledWith(
        { gsi1pk: "Ingest" },
        { index: "gsi1", reverse: true, limit: 5 },
      );
    });
  });

  describe("updateStatus", () => {
    it("updates the status of an ingestion log entry", async () => {
      mockUpdate.mockResolvedValueOnce(internalItem({ status: "completed" }));

      await entity.updateStatus(
        "usopc-bylaws",
        "2024-01-15T12:00:00.000Z",
        "completed",
      );

      expect(mockUpdate).toHaveBeenCalledWith({
        sourceId: "usopc-bylaws",
        startedAt: "2024-01-15T12:00:00.000Z",
        status: "completed",
      });
    });

    it("includes optional fields when provided", async () => {
      mockUpdate.mockResolvedValueOnce(
        internalItem({
          status: "completed",
          contentHash: "abc123",
          chunksCount: 10,
          completedAt: "2024-01-15T13:00:00.000Z",
        }),
      );

      await entity.updateStatus(
        "usopc-bylaws",
        "2024-01-15T12:00:00.000Z",
        "completed",
        {
          contentHash: "abc123",
          chunksCount: 10,
          completedAt: "2024-01-15T13:00:00.000Z",
        },
      );

      expect(mockUpdate).toHaveBeenCalledWith({
        sourceId: "usopc-bylaws",
        startedAt: "2024-01-15T12:00:00.000Z",
        status: "completed",
        contentHash: "abc123",
        chunksCount: 10,
        completedAt: "2024-01-15T13:00:00.000Z",
      });
    });

    it("includes errorMessage for failed status", async () => {
      mockUpdate.mockResolvedValueOnce(
        internalItem({ status: "failed", errorMessage: "Network error" }),
      );

      await entity.updateStatus(
        "usopc-bylaws",
        "2024-01-15T12:00:00.000Z",
        "failed",
        { errorMessage: "Network error" },
      );

      expect(mockUpdate).toHaveBeenCalledWith({
        sourceId: "usopc-bylaws",
        startedAt: "2024-01-15T12:00:00.000Z",
        status: "failed",
        errorMessage: "Network error",
      });
    });
  });

  describe("getLastContentHash", () => {
    it("returns content hash from the most recent completed ingestion", async () => {
      mockFind.mockResolvedValueOnce([
        internalItem({ status: "failed", contentHash: undefined }),
        internalItem({ status: "completed", contentHash: "abc123hash" }),
        internalItem({ status: "completed", contentHash: "older-hash" }),
      ]);

      const result = await entity.getLastContentHash("usopc-bylaws");

      expect(result).toBe("abc123hash");
      expect(mockFind).toHaveBeenCalledWith(
        { sourceId: "usopc-bylaws" },
        { reverse: true, limit: 20 },
      );
    });

    it("returns null when no completed ingestions exist", async () => {
      mockFind.mockResolvedValueOnce([
        internalItem({ status: "in_progress" }),
        internalItem({ status: "failed" }),
      ]);

      const result = await entity.getLastContentHash("usopc-bylaws");

      expect(result).toBeNull();
    });

    it("returns null when no ingestion logs exist", async () => {
      mockFind.mockResolvedValueOnce([]);

      const result = await entity.getLastContentHash("nonexistent");

      expect(result).toBeNull();
    });
  });
});
