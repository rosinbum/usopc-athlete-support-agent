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
import { AgentModelEntity, type AgentModelConfig } from "./AgentModelEntity.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function internalItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent",
    role: "Primary reasoning agent",
    model: "claude-sonnet-4-20250514",
    temperature: 0.1,
    maxTokens: 4096,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentModelEntity", () => {
  let entity: AgentModelEntity;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
    entity = new AgentModelEntity(mockTable as never);
  });

  describe("get", () => {
    it("returns null for a missing item", async () => {
      mockGet.mockResolvedValueOnce(undefined);

      const result = await entity.get("nonexistent");

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith({ id: "nonexistent" });
    });

    it("converts internal item to external shape", async () => {
      mockGet.mockResolvedValueOnce(internalItem());

      const result = await entity.get("agent");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("agent");
      expect(result!.role).toBe("Primary reasoning agent");
      expect(result!.model).toBe("claude-sonnet-4-20250514");
      expect(result!.temperature).toBe(0.1);
      expect(result!.maxTokens).toBe(4096);
      expect(result!.createdAt).toBe("2024-01-01T00:00:00.000Z");
      expect(result!.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    });

    it("handles embeddings config with dimensions", async () => {
      mockGet.mockResolvedValueOnce(
        internalItem({
          id: "embeddings",
          role: "Text embeddings",
          model: "text-embedding-3-small",
          temperature: undefined,
          maxTokens: undefined,
          dimensions: 1536,
        }),
      );

      const result = await entity.get("embeddings");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("embeddings");
      expect(result!.dimensions).toBe(1536);
      expect(result!.temperature).toBeUndefined();
      expect(result!.maxTokens).toBeUndefined();
    });
  });

  describe("upsert", () => {
    it("creates a new item when it does not exist", async () => {
      const created = internalItem({
        createdAt: "2024-01-15T12:00:00.000Z",
        updatedAt: "2024-01-15T12:00:00.000Z",
      });
      mockCreate.mockResolvedValueOnce(created);

      const config: AgentModelConfig = {
        id: "agent",
        role: "Primary reasoning agent",
        model: "claude-sonnet-4-20250514",
        temperature: 0.1,
        maxTokens: 4096,
      };

      const result = await entity.upsert(config);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "agent",
          role: "Primary reasoning agent",
          model: "claude-sonnet-4-20250514",
          temperature: 0.1,
          maxTokens: 4096,
          createdAt: "2024-01-15T12:00:00.000Z",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
        { exists: null },
      );

      expect(result.id).toBe("agent");
      expect(result.model).toBe("claude-sonnet-4-20250514");
    });

    it("falls back to update when item already exists", async () => {
      mockCreate.mockRejectedValueOnce(new Error("Conditional check failed"));
      mockUpdate.mockResolvedValueOnce(
        internalItem({
          model: "claude-sonnet-4-20250514",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );

      const config: AgentModelConfig = {
        id: "agent",
        role: "Primary reasoning agent",
        model: "claude-sonnet-4-20250514",
        temperature: 0.1,
        maxTokens: 4096,
      };

      const result = await entity.upsert(config);

      expect(mockCreate).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "agent",
          model: "claude-sonnet-4-20250514",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );
      expect(result.model).toBe("claude-sonnet-4-20250514");
    });

    it("preserves existing createdAt when provided", async () => {
      const created = internalItem({
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-15T12:00:00.000Z",
      });
      mockCreate.mockResolvedValueOnce(created);

      const config: AgentModelConfig = {
        id: "agent",
        role: "Primary reasoning agent",
        model: "claude-sonnet-4-20250514",
        createdAt: "2024-01-01T00:00:00.000Z",
      };

      await entity.upsert(config);

      const createArg = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(createArg.createdAt).toBe("2024-01-01T00:00:00.000Z");
    });

    it("includes dimensions for embeddings config", async () => {
      const created = internalItem({
        id: "embeddings",
        role: "Text embeddings",
        model: "text-embedding-3-small",
        dimensions: 1536,
      });
      mockCreate.mockResolvedValueOnce(created);

      const config: AgentModelConfig = {
        id: "embeddings",
        role: "Text embeddings",
        model: "text-embedding-3-small",
        dimensions: 1536,
      };

      const result = await entity.upsert(config);

      const createArg = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(createArg.dimensions).toBe(1536);
      expect(result.dimensions).toBe(1536);
    });
  });

  describe("getAll", () => {
    it("returns all agent model configs via model.scan", async () => {
      mockScan.mockResolvedValueOnce([
        internalItem({ id: "agent" }),
        internalItem({ id: "classifier", model: "claude-haiku-4-5-20251001" }),
        internalItem({
          id: "embeddings",
          model: "text-embedding-3-small",
          dimensions: 1536,
        }),
      ]);

      const results = await entity.getAll();

      expect(results).toHaveLength(3);
      expect(results[0]!.id).toBe("agent");
      expect(results[1]!.id).toBe("classifier");
      expect(results[1]!.model).toBe("claude-haiku-4-5-20251001");
      expect(results[2]!.id).toBe("embeddings");
      expect(results[2]!.dimensions).toBe(1536);
    });

    it("returns empty array when no configs exist", async () => {
      mockScan.mockResolvedValueOnce([]);

      const results = await entity.getAll();

      expect(results).toEqual([]);
    });
  });
});
