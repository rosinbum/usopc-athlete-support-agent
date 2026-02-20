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
  DiscoveredSourceEntity,
  type CreateDiscoveredSourceInput,
} from "./DiscoveredSourceEntity.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Returns the OneTable-internal representation (no nulls). */
function internalItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "abc123",
    url: "https://usopc.org/governance/bylaws",
    title: "USOPC Bylaws",
    discoveryMethod: "map",
    discoveredAt: "2024-01-01T00:00:00.000Z",
    discoveredFrom: "usopc.org",
    status: "pending_metadata",
    topicDomains: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createSampleInput(): CreateDiscoveredSourceInput {
  return {
    id: "abc123",
    url: "https://usopc.org/governance/bylaws",
    title: "USOPC Bylaws",
    discoveryMethod: "map",
    discoveredFrom: "usopc.org",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiscoveredSourceEntity", () => {
  let entity: DiscoveredSourceEntity;

  beforeEach(() => {
    vi.clearAllMocks();
    entity = new DiscoveredSourceEntity(mockTable as never);
  });

  describe("create", () => {
    it("should create a discovered source with pending_metadata status", async () => {
      mockCreate.mockResolvedValue(undefined);

      const input = createSampleInput();
      const result = await entity.create(input);

      expect(result.id).toBe("abc123");
      expect(result.url).toBe("https://usopc.org/governance/bylaws");
      expect(result.status).toBe("pending_metadata");
      expect(result.metadataConfidence).toBeNull();
      expect(result.contentConfidence).toBeNull();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "abc123",
          status: "pending_metadata",
        }),
        { exists: null },
      );
    });

    it("should handle missing discoveredFrom", async () => {
      mockCreate.mockResolvedValue(undefined);

      const input = {
        id: "abc123",
        url: "https://example.com",
        title: "Test",
        discoveryMethod: "search" as const,
      };
      const result = await entity.create(input);

      expect(result.discoveredFrom).toBeNull();
    });
  });

  describe("getById", () => {
    it("should return a discovered source by ID", async () => {
      mockGet.mockResolvedValue(internalItem());

      const result = await entity.getById("abc123");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("abc123");
      expect(result?.url).toBe("https://usopc.org/governance/bylaws");
      expect(mockGet).toHaveBeenCalledWith({ id: "abc123" });
    });

    it("should return null if not found", async () => {
      mockGet.mockResolvedValue(null);

      const result = await entity.getById("nonexistent");

      expect(result).toBeNull();
    });

    it("should convert undefined fields to null", async () => {
      mockGet.mockResolvedValue(internalItem());

      const result = await entity.getById("abc123");

      expect(result?.metadataConfidence).toBeNull();
      expect(result?.ngbId).toBeNull();
      expect(result?.reviewedBy).toBeNull();
    });
  });

  describe("getAll", () => {
    it("should return all discovered sources", async () => {
      mockScan.mockResolvedValue([
        internalItem(),
        internalItem({ id: "xyz789", url: "https://example.com" }),
      ]);

      const results = await entity.getAll();

      expect(results).toHaveLength(2);
      expect(results[0]!.id).toBe("abc123");
      expect(results[1]!.id).toBe("xyz789");
      expect(mockScan).toHaveBeenCalledWith({});
    });

    it("should return empty array if no sources", async () => {
      mockScan.mockResolvedValue([]);

      const results = await entity.getAll();

      expect(results).toEqual([]);
    });
  });

  describe("getByStatus", () => {
    it("should query by status using gsi1", async () => {
      mockFind.mockResolvedValue([internalItem({ status: "approved" })]);

      const results = await entity.getByStatus("approved");

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("approved");
      expect(mockFind).toHaveBeenCalledWith(
        { gsi1pk: "Discovery#approved" },
        { index: "gsi1", reverse: true },
      );
    });

    it("should return empty array if no sources with status", async () => {
      mockFind.mockResolvedValue([]);

      const results = await entity.getByStatus("rejected");

      expect(results).toEqual([]);
    });
  });

  describe("update", () => {
    it("should update a discovered source", async () => {
      const updated = internalItem({
        status: "approved",
        updatedAt: "2024-01-02T00:00:00.000Z",
      });
      mockUpdate.mockResolvedValue(updated);

      const result = await entity.update("abc123", { status: "approved" });

      expect(result.status).toBe("approved");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "abc123",
          status: "approved",
        }),
      );
    });

    it("should remove null values from updates", async () => {
      mockUpdate.mockResolvedValue(internalItem());

      await entity.update("abc123", {
        ngbId: null,
        description: null,
      });

      // toInternal strips nulls
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          ngbId: null,
          description: null,
        }),
      );
    });
  });

  describe("delete", () => {
    it("should delete a discovered source", async () => {
      mockRemove.mockResolvedValue(undefined);

      await entity.delete("abc123");

      expect(mockRemove).toHaveBeenCalledWith({ id: "abc123" });
    });
  });

  describe("markMetadataEvaluated", () => {
    it("should mark as pending_content if confidence >= 0.5", async () => {
      mockUpdate.mockResolvedValue(internalItem({ status: "pending_content" }));

      await entity.markMetadataEvaluated(
        "abc123",
        0.75,
        "Looks like a governance document",
        ["governance"],
        "Bylaws",
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "abc123",
          status: "pending_content",
          metadataConfidence: 0.75,
          metadataReasoning: "Looks like a governance document",
          topicDomains: ["governance"],
          documentType: "Bylaws",
        }),
      );
    });

    it("should mark as rejected if confidence < 0.5", async () => {
      mockUpdate.mockResolvedValue(internalItem({ status: "rejected" }));

      await entity.markMetadataEvaluated(
        "abc123",
        0.3,
        "Likely a news article",
        [],
        "News",
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "rejected",
          metadataConfidence: 0.3,
        }),
      );
    });
  });

  describe("markContentEvaluated", () => {
    it("should mark as approved if confidence >= threshold", async () => {
      mockUpdate.mockResolvedValue(internalItem({ status: "approved" }));

      await entity.markContentEvaluated(
        "abc123",
        0.9,
        0.88,
        {
          documentType: "Bylaws",
          topicDomains: ["governance"],
          authorityLevel: "usopc_governance",
          priority: "high",
          description: "USOPC Bylaws document",
          ngbId: null,
          format: "pdf",
        },
        "High-quality governance document",
        0.85,
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "abc123",
          status: "approved",
          contentConfidence: 0.9,
          combinedConfidence: 0.88,
          documentType: "Bylaws",
          authorityLevel: "usopc_governance",
          priority: "high",
        }),
      );
    });

    it("should mark as rejected if confidence < threshold", async () => {
      mockUpdate.mockResolvedValue(internalItem({ status: "rejected" }));

      await entity.markContentEvaluated(
        "abc123",
        0.6,
        0.7,
        {
          documentType: "Unknown",
          topicDomains: [],
          authorityLevel: "educational_guidance",
          priority: "low",
          description: "Low quality",
          ngbId: null,
          format: "html",
        },
        "Not authoritative",
        0.85,
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "rejected",
          combinedConfidence: 0.7,
        }),
      );
    });
  });

  describe("approve", () => {
    it("should manually approve a source", async () => {
      mockUpdate.mockResolvedValue(internalItem({ status: "approved" }));

      await entity.approve("abc123", "admin@example.com");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "abc123",
          status: "approved",
          reviewedBy: "admin@example.com",
        }),
      );
    });
  });

  describe("reject", () => {
    it("should manually reject a source with reason", async () => {
      mockUpdate.mockResolvedValue(internalItem({ status: "rejected" }));

      await entity.reject("abc123", "admin@example.com", "Not relevant");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "abc123",
          status: "rejected",
          reviewedBy: "admin@example.com",
          rejectionReason: "Not relevant",
        }),
      );
    });
  });

  describe("linkToSourceConfig", () => {
    it("should link to a source config", async () => {
      mockUpdate.mockResolvedValue(
        internalItem({ sourceConfigId: "source-123" }),
      );

      await entity.linkToSourceConfig("abc123", "source-123");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "abc123",
          sourceConfigId: "source-123",
        }),
      );
    });
  });
});
