import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();
const mockGet = vi.fn();
const mockFind = vi.fn();

const mockModel = {
  create: mockCreate,
  get: mockGet,
  find: mockFind,
};

const mockTable = {
  getModel: vi.fn(() => mockModel),
} as unknown;

import { FeedbackEntity } from "./FeedbackEntity.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FeedbackEntity", () => {
  let entity: FeedbackEntity;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-24T12:00:00.000Z"));
    entity = new FeedbackEntity(mockTable as never);
  });

  describe("create", () => {
    it("creates a feedback record with required fields", async () => {
      mockCreate.mockResolvedValueOnce({
        id: "test-uuid",
        conversationId: "conv-1",
        channel: "slack",
        score: 1,
        createdAt: "2026-02-24T12:00:00.000Z",
      });

      const result = await entity.create({
        conversationId: "conv-1",
        channel: "slack",
        score: 1,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-1",
          channel: "slack",
          score: 1,
          createdAt: "2026-02-24T12:00:00.000Z",
        }),
      );
      expect(result.conversationId).toBe("conv-1");
      expect(result.channel).toBe("slack");
      expect(result.score).toBe(1);
    });

    it("includes optional fields when provided", async () => {
      mockCreate.mockResolvedValueOnce({
        id: "test-uuid",
        conversationId: "conv-2",
        channel: "web",
        score: 0,
        comment: "Not relevant",
        messageId: "msg-1",
        userId: "user-1",
        runId: "run-1",
        createdAt: "2026-02-24T12:00:00.000Z",
      });

      const result = await entity.create({
        conversationId: "conv-2",
        channel: "web",
        score: 0,
        comment: "Not relevant",
        messageId: "msg-1",
        userId: "user-1",
        runId: "run-1",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-2",
          channel: "web",
          score: 0,
          comment: "Not relevant",
          messageId: "msg-1",
          userId: "user-1",
          runId: "run-1",
        }),
      );
      expect(result.comment).toBe("Not relevant");
      expect(result.messageId).toBe("msg-1");
      expect(result.userId).toBe("user-1");
      expect(result.runId).toBe("run-1");
    });
  });

  describe("getById", () => {
    it("returns null when item does not exist", async () => {
      mockGet.mockResolvedValueOnce(undefined);

      const result = await entity.getById("nonexistent");

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith({ id: "nonexistent" });
    });

    it("returns the feedback when item exists", async () => {
      mockGet.mockResolvedValueOnce({
        id: "fb-1",
        conversationId: "conv-1",
        channel: "slack",
        score: 1,
        createdAt: "2026-02-24T12:00:00.000Z",
      });

      const result = await entity.getById("fb-1");

      expect(result).toEqual({
        id: "fb-1",
        conversationId: "conv-1",
        channel: "slack",
        score: 1,
        comment: undefined,
        messageId: undefined,
        userId: undefined,
        runId: undefined,
        createdAt: "2026-02-24T12:00:00.000Z",
      });
    });
  });

  describe("getByConversationId", () => {
    it("returns empty array when no feedback exists", async () => {
      mockFind.mockResolvedValueOnce([]);

      const result = await entity.getByConversationId("conv-1");

      expect(result).toEqual([]);
      expect(mockFind).toHaveBeenCalledWith(
        { gsi1pk: "Feedback#conv-1" },
        { index: "gsi1" },
      );
    });

    it("returns feedback items for the conversation", async () => {
      mockFind.mockResolvedValueOnce([
        {
          id: "fb-1",
          conversationId: "conv-1",
          channel: "slack",
          score: 1,
          createdAt: "2026-02-24T11:00:00.000Z",
        },
        {
          id: "fb-2",
          conversationId: "conv-1",
          channel: "web",
          score: 0,
          createdAt: "2026-02-24T12:00:00.000Z",
        },
      ]);

      const result = await entity.getByConversationId("conv-1");

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("fb-1");
      expect(result[1]!.id).toBe("fb-2");
    });
  });
});
