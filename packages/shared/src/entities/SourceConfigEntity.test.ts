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
import {
  SourceConfigEntity,
  type SourceConfig,
  type CreateSourceInput,
} from "./SourceConfigEntity.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A sample SourceConfig as returned by the public API (external shape). */
const SAMPLE_SOURCE: SourceConfig = {
  id: "usopc-bylaws",
  title: "USOPC Bylaws",
  documentType: "bylaws",
  topicDomains: ["governance", "athlete_rights"],
  url: "https://example.com/bylaws.pdf",
  format: "pdf",
  ngbId: null,
  priority: "high",
  description: "Official USOPC bylaws document",
  authorityLevel: "usopc_governance",
  enabled: true,
  lastIngestedAt: null,
  lastContentHash: null,
  consecutiveFailures: 0,
  lastError: null,
  s3Key: null,
  s3VersionId: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

/** Returns the OneTable-internal representation (string enabled, no nulls). */
function internalItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "usopc-bylaws",
    title: "USOPC Bylaws",
    documentType: "bylaws",
    topicDomains: ["governance", "athlete_rights"],
    url: "https://example.com/bylaws.pdf",
    format: "pdf",
    priority: "high",
    description: "Official USOPC bylaws document",
    authorityLevel: "usopc_governance",
    enabled: "true",
    consecutiveFailures: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createSampleInput(): CreateSourceInput {
  return {
    id: "usopc-bylaws",
    title: "USOPC Bylaws",
    documentType: "bylaws",
    topicDomains: ["governance", "athlete_rights"],
    url: "https://example.com/bylaws.pdf",
    format: "pdf",
    ngbId: null,
    priority: "high",
    description: "Official USOPC bylaws document",
    authorityLevel: "usopc_governance",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SourceConfigEntity", () => {
  let entity: SourceConfigEntity;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
    entity = new SourceConfigEntity(mockTable as never);
  });

  describe("create", () => {
    it("calls model.create with internal representation and returns external shape", async () => {
      mockCreate.mockResolvedValueOnce(
        internalItem({
          createdAt: "2024-01-15T12:00:00.000Z",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );

      const input = createSampleInput();
      const result = await entity.create(input);

      // Verify model.create was called with the internal representation
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "usopc-bylaws",
          enabled: "true", // boolean -> string
          consecutiveFailures: 0,
          createdAt: "2024-01-15T12:00:00.000Z",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
        { exists: null },
      );

      // Null fields should be stripped from the internal call
      const createArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(createArg.ngbId).toBeUndefined();
      expect(createArg.lastIngestedAt).toBeUndefined();
      expect(createArg.lastError).toBeUndefined();

      // Return value should be in external shape
      expect(result.id).toBe("usopc-bylaws");
      expect(result.enabled).toBe(true); // string -> boolean
      expect(result.createdAt).toBe("2024-01-15T12:00:00.000Z");
    });

    it("initializes with default values", async () => {
      mockCreate.mockResolvedValueOnce(internalItem());

      const input = createSampleInput();
      const result = await entity.create(input);

      expect(result.enabled).toBe(true);
      expect(result.consecutiveFailures).toBe(0);
      expect(result.lastIngestedAt).toBeNull();
      expect(result.lastContentHash).toBeNull();
      expect(result.lastError).toBeNull();
      expect(result.s3Key).toBeNull();
      expect(result.s3VersionId).toBeNull();
    });
  });

  describe("getById", () => {
    it("returns null for missing item", async () => {
      mockGet.mockResolvedValueOnce(undefined);

      const result = await entity.getById("nonexistent");

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith({ id: "nonexistent" });
    });

    it("converts internal item to external shape", async () => {
      mockGet.mockResolvedValueOnce(internalItem());

      const result = await entity.getById("usopc-bylaws");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("usopc-bylaws");
      expect(result!.title).toBe("USOPC Bylaws");
      expect(result!.topicDomains).toEqual(["governance", "athlete_rights"]);
      expect(result!.format).toBe("pdf");
      expect(result!.authorityLevel).toBe("usopc_governance");
      expect(result!.enabled).toBe(true);
      expect(result!.ngbId).toBeNull();
    });
  });

  describe("getAll", () => {
    it("queries gsi1 with SOURCE#ALL partition key", async () => {
      mockFind.mockResolvedValueOnce([
        internalItem({ id: "src1" }),
        internalItem({ id: "src2", enabled: "false" }),
      ]);

      const results = await entity.getAll();

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("src1");
      expect(results[1].id).toBe("src2");
      expect(results[1].enabled).toBe(false);
      expect(mockFind).toHaveBeenCalledWith(
        { gsi1pk: "SOURCE#ALL" },
        { index: "gsi1" },
      );
    });

    it("returns empty array when no sources exist", async () => {
      mockFind.mockResolvedValueOnce([]);

      const results = await entity.getAll();

      expect(results).toEqual([]);
    });
  });

  describe("getAllEnabled", () => {
    it("queries enabled-priority-index GSI", async () => {
      mockFind.mockResolvedValueOnce([
        internalItem({ id: "src1" }),
        internalItem({ id: "src2" }),
      ]);

      const results = await entity.getAllEnabled();

      expect(results).toHaveLength(2);
      expect(mockFind).toHaveBeenCalledWith(
        { enabled: "true" },
        { index: "enabled-priority-index" },
      );
    });

    it("returns empty array when no enabled sources", async () => {
      mockFind.mockResolvedValueOnce([]);

      const results = await entity.getAllEnabled();

      expect(results).toEqual([]);
    });
  });

  describe("getByNgb", () => {
    it("queries ngbId-index GSI", async () => {
      mockFind.mockResolvedValueOnce([
        internalItem({
          id: "usa-swimming-rules",
          ngbId: "usa-swimming",
        }),
      ]);

      const results = await entity.getByNgb("usa-swimming");

      expect(results).toHaveLength(1);
      expect(results[0].ngbId).toBe("usa-swimming");
      expect(mockFind).toHaveBeenCalledWith(
        { ngbId: "usa-swimming" },
        { index: "ngbId-index" },
      );
    });
  });

  describe("update", () => {
    it("merges updates, sets updatedAt, and converts enabled", async () => {
      mockUpdate.mockResolvedValueOnce(
        internalItem({
          url: "https://example.com/new-bylaws.pdf",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );

      const result = await entity.update("usopc-bylaws", {
        url: "https://example.com/new-bylaws.pdf",
      });

      expect(result.url).toBe("https://example.com/new-bylaws.pdf");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "usopc-bylaws",
          url: "https://example.com/new-bylaws.pdf",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );
    });
  });

  describe("markSuccess", () => {
    it("resets failures, sets hash, timestamp, and S3 info", async () => {
      mockUpdate.mockResolvedValueOnce(
        internalItem({
          lastContentHash: "abc123hash",
          lastIngestedAt: "2024-01-15T12:00:00.000Z",
          consecutiveFailures: 0,
          s3Key: "sources/usopc-bylaws/abc123hash.pdf",
          s3VersionId: "v1",
        }),
      );

      await entity.markSuccess("usopc-bylaws", "abc123hash", {
        s3Key: "sources/usopc-bylaws/abc123hash.pdf",
        s3VersionId: "v1",
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "usopc-bylaws",
          lastContentHash: "abc123hash",
          consecutiveFailures: 0,
          s3Key: "sources/usopc-bylaws/abc123hash.pdf",
          s3VersionId: "v1",
        }),
        { remove: ["lastError"] },
      );
    });
  });

  describe("markFailure", () => {
    it("increments failures and sets lastError", async () => {
      // First call: get current item
      mockGet.mockResolvedValueOnce(internalItem({ consecutiveFailures: 2 }));
      // Second call: update
      mockUpdate.mockResolvedValueOnce(
        internalItem({
          consecutiveFailures: 3,
          lastError: "Connection timeout",
        }),
      );

      await entity.markFailure("usopc-bylaws", "Connection timeout");

      expect(mockGet).toHaveBeenCalledWith({ id: "usopc-bylaws" });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "usopc-bylaws",
          consecutiveFailures: 3,
          lastError: "Connection timeout",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );
    });

    it("starts from 0 when item has no failures field", async () => {
      mockGet.mockResolvedValueOnce(
        internalItem({ consecutiveFailures: undefined }),
      );
      mockUpdate.mockResolvedValueOnce(
        internalItem({ consecutiveFailures: 1 }),
      );

      await entity.markFailure("usopc-bylaws", "Some error");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          consecutiveFailures: 1,
        }),
      );
    });
  });

  describe("disable", () => {
    it("calls update with enabled: false", async () => {
      mockUpdate.mockResolvedValueOnce(internalItem({ enabled: "false" }));

      await entity.disable("usopc-bylaws");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "usopc-bylaws",
          enabled: "false",
        }),
      );
    });
  });

  describe("enable", () => {
    it("calls update with enabled: true", async () => {
      mockUpdate.mockResolvedValueOnce(internalItem({ enabled: "true" }));

      await entity.enable("usopc-bylaws");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "usopc-bylaws",
          enabled: "true",
        }),
      );
    });
  });

  describe("delete", () => {
    it("removes the item from the table", async () => {
      mockRemove.mockResolvedValueOnce(undefined);

      await entity.delete("usopc-bylaws");

      expect(mockRemove).toHaveBeenCalledWith({ id: "usopc-bylaws" });
    });
  });
});
