import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
const mockUpsert = vi.fn();

const mockModel = {
  get: mockGet,
  upsert: mockUpsert,
};

const mockTable = {
  getModel: vi.fn(() => mockModel),
} as unknown;

import { ConversationSummaryEntity } from "./ConversationSummaryEntity.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConversationSummaryEntity", () => {
  let entity: ConversationSummaryEntity;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T12:00:00.000Z"));
    entity = new ConversationSummaryEntity(mockTable as never);
  });

  describe("get", () => {
    it("returns null when item does not exist", async () => {
      mockGet.mockResolvedValueOnce(undefined);

      const result = await entity.get("nonexistent");

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith({ conversationId: "nonexistent" });
    });

    it("returns the summary when item exists and is not expired", async () => {
      const futureEpoch = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      mockGet.mockResolvedValueOnce({
        conversationId: "conv-1",
        summary: "User asked about selection criteria.",
        ttl: futureEpoch,
        updatedAt: "2026-02-19T11:00:00.000Z",
      });

      const result = await entity.get("conv-1");

      expect(result).toEqual({
        conversationId: "conv-1",
        summary: "User asked about selection criteria.",
        ttl: futureEpoch,
        updatedAt: "2026-02-19T11:00:00.000Z",
      });
    });

    it("returns null when item TTL has expired", async () => {
      const pastEpoch = Math.floor(Date.now() / 1000) - 1; // 1 second ago
      mockGet.mockResolvedValueOnce({
        conversationId: "conv-1",
        summary: "Expired summary",
        ttl: pastEpoch,
        updatedAt: "2026-02-19T10:00:00.000Z",
      });

      const result = await entity.get("conv-1");

      expect(result).toBeNull();
    });

    it("returns item when ttl is not set (no expiration)", async () => {
      mockGet.mockResolvedValueOnce({
        conversationId: "conv-1",
        summary: "Summary without TTL",
      });

      const result = await entity.get("conv-1");

      expect(result).toEqual({
        conversationId: "conv-1",
        summary: "Summary without TTL",
        ttl: undefined,
        updatedAt: undefined,
      });
    });
  });

  describe("upsert", () => {
    it("creates a new summary with TTL", async () => {
      const nowEpoch = Math.floor(Date.now() / 1000);
      const expectedTtl = nowEpoch + 3600;

      mockUpsert.mockResolvedValueOnce({
        conversationId: "conv-1",
        summary: "New summary text.",
        ttl: expectedTtl,
        updatedAt: "2026-02-19T12:00:00.000Z",
      });

      const result = await entity.upsert("conv-1", "New summary text.", 3600);

      expect(mockUpsert).toHaveBeenCalledWith(
        {
          conversationId: "conv-1",
          summary: "New summary text.",
          ttl: expectedTtl,
          updatedAt: "2026-02-19T12:00:00.000Z",
        },
        { exists: null },
      );
      expect(result.conversationId).toBe("conv-1");
      expect(result.summary).toBe("New summary text.");
      expect(result.ttl).toBe(expectedTtl);
    });

    it("overwrites an existing summary", async () => {
      const nowEpoch = Math.floor(Date.now() / 1000);
      const expectedTtl = nowEpoch + 1800;

      mockUpsert.mockResolvedValueOnce({
        conversationId: "conv-1",
        summary: "Updated summary.",
        ttl: expectedTtl,
        updatedAt: "2026-02-19T12:00:00.000Z",
      });

      const result = await entity.upsert("conv-1", "Updated summary.", 1800);

      expect(result.summary).toBe("Updated summary.");
      expect(result.ttl).toBe(expectedTtl);
    });

    it("sets TTL correctly based on ttlSeconds parameter", async () => {
      const nowEpoch = Math.floor(Date.now() / 1000);
      const ttlSeconds = 7200; // 2 hours
      const expectedTtl = nowEpoch + ttlSeconds;

      mockUpsert.mockResolvedValueOnce({
        conversationId: "conv-1",
        summary: "Summary",
        ttl: expectedTtl,
        updatedAt: "2026-02-19T12:00:00.000Z",
      });

      await entity.upsert("conv-1", "Summary", ttlSeconds);

      const upsertArg = mockUpsert.mock.calls[0]![0] as Record<string, unknown>;
      expect(upsertArg.ttl).toBe(expectedTtl);
    });
  });
});
