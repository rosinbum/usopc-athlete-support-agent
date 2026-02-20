import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    parseEnvInt: vi.fn((_key: string, fallback: number) => fallback),
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

import { DynamoSummaryStore } from "./dynamoSummaryStore.js";
import type { ConversationSummaryEntity } from "@usopc/shared";

function createMockEntity() {
  return {
    get: vi.fn(),
    upsert: vi.fn(),
  } as unknown as ConversationSummaryEntity & {
    get: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
}

describe("DynamoSummaryStore", () => {
  let mockEntity: ReturnType<typeof createMockEntity>;
  let store: DynamoSummaryStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEntity = createMockEntity();
    // Use explicit TTL of 3600000ms (1 hour) to avoid env-var dependency
    store = new DynamoSummaryStore(mockEntity, 3_600_000);
  });

  describe("get", () => {
    it("returns the summary when entity returns an item", async () => {
      mockEntity.get.mockResolvedValueOnce({
        conversationId: "conv-1",
        summary: "User discussed selection criteria.",
        ttl: 9999999999,
        updatedAt: "2026-02-19T12:00:00.000Z",
      });

      const result = await store.get("conv-1");

      expect(result).toBe("User discussed selection criteria.");
      expect(mockEntity.get).toHaveBeenCalledWith("conv-1");
    });

    it("returns undefined when entity returns null", async () => {
      mockEntity.get.mockResolvedValueOnce(null);

      const result = await store.get("nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("set", () => {
    it("delegates to entity.upsert with TTL converted from ms to seconds", async () => {
      mockEntity.upsert.mockResolvedValueOnce({
        conversationId: "conv-1",
        summary: "Summary text.",
      });

      await store.set("conv-1", "Summary text.");

      expect(mockEntity.upsert).toHaveBeenCalledWith(
        "conv-1",
        "Summary text.",
        3600, // 3_600_000ms / 1000
      );
    });

    it("uses default TTL from getSummaryTtlMs when no ttlMs provided", async () => {
      const storeNoTtl = new DynamoSummaryStore(mockEntity);
      mockEntity.upsert.mockResolvedValueOnce({
        conversationId: "conv-1",
        summary: "Text",
      });

      await storeNoTtl.set("conv-1", "Text");

      // Default is 3_600_000ms = 3600 seconds
      expect(mockEntity.upsert).toHaveBeenCalledWith("conv-1", "Text", 3600);
    });
  });
});
