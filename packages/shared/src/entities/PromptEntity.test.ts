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
import { PromptEntity, type PromptConfig } from "./PromptEntity.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function internalItem(overrides: Record<string, unknown> = {}) {
  return {
    name: "classifier",
    content: "You are a classifier that analyzes user queries...",
    domain: "classification",
    version: 1,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PromptEntity", () => {
  let entity: PromptEntity;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
    entity = new PromptEntity(mockTable as never);
  });

  describe("get", () => {
    it("returns null for a missing item", async () => {
      mockGet.mockResolvedValueOnce(undefined);

      const result = await entity.get("nonexistent");

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith({ name: "nonexistent" });
    });

    it("converts internal item to external shape", async () => {
      mockGet.mockResolvedValueOnce(internalItem());

      const result = await entity.get("classifier");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("classifier");
      expect(result!.content).toBe(
        "You are a classifier that analyzes user queries...",
      );
      expect(result!.domain).toBe("classification");
      expect(result!.version).toBe(1);
      expect(result!.createdAt).toBe("2024-01-01T00:00:00.000Z");
      expect(result!.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    });

    it("defaults version to 1 when not present", async () => {
      mockGet.mockResolvedValueOnce(internalItem({ version: undefined }));

      const result = await entity.get("classifier");

      expect(result!.version).toBe(1);
    });

    it("handles prompt without domain", async () => {
      mockGet.mockResolvedValueOnce(internalItem({ domain: undefined }));

      const result = await entity.get("classifier");

      expect(result!.domain).toBeUndefined();
    });
  });

  describe("upsert", () => {
    it("creates a new item when it does not exist", async () => {
      const created = internalItem({
        createdAt: "2024-01-15T12:00:00.000Z",
        updatedAt: "2024-01-15T12:00:00.000Z",
      });
      mockCreate.mockResolvedValueOnce(created);

      const result = await entity.upsert({
        name: "classifier",
        content: "You are a classifier that analyzes user queries...",
        domain: "classification",
        version: 1,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "classifier",
          content: "You are a classifier that analyzes user queries...",
          domain: "classification",
          version: 1,
          createdAt: "2024-01-15T12:00:00.000Z",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
        { exists: null },
      );

      expect(result.name).toBe("classifier");
      expect(result.content).toBe(
        "You are a classifier that analyzes user queries...",
      );
    });

    it("falls back to update when item already exists", async () => {
      mockCreate.mockRejectedValueOnce(new Error("Conditional check failed"));
      mockUpdate.mockResolvedValueOnce(
        internalItem({
          content: "Updated classifier prompt",
          version: 2,
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );

      const result = await entity.upsert({
        name: "classifier",
        content: "Updated classifier prompt",
        version: 2,
      });

      expect(mockCreate).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "classifier",
          content: "Updated classifier prompt",
          version: 2,
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );

      // createdAt should NOT be in the update call
      const updateArg = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
      expect(updateArg.createdAt).toBeUndefined();

      expect(result.content).toBe("Updated classifier prompt");
      expect(result.version).toBe(2);
    });

    it("omits domain when not provided", async () => {
      mockCreate.mockResolvedValueOnce(internalItem({ domain: undefined }));

      await entity.upsert({
        name: "system",
        content: "You are an AI assistant...",
        version: 1,
      });

      const createArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(createArg.domain).toBeUndefined();
    });
  });

  describe("getAll", () => {
    it("returns all prompts via model.scan", async () => {
      mockScan.mockResolvedValueOnce([
        internalItem({ name: "classifier" }),
        internalItem({ name: "synthesizer" }),
        internalItem({ name: "system" }),
      ]);

      const results = await entity.getAll();

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe("classifier");
      expect(results[1].name).toBe("synthesizer");
      expect(results[2].name).toBe("system");
    });

    it("returns empty array when no prompts exist", async () => {
      mockScan.mockResolvedValueOnce([]);

      const results = await entity.getAll();

      expect(results).toEqual([]);
    });
  });

  describe("delete", () => {
    it("removes the item from the table", async () => {
      mockRemove.mockResolvedValueOnce(undefined);

      await entity.delete("classifier");

      expect(mockRemove).toHaveBeenCalledWith({ name: "classifier" });
    });
  });
});
