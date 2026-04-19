import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@usopc/shared", () => ({
  getResource: vi.fn((key: string) => {
    if (key === "DiscoveryFeedQueue")
      return { url: "https://pubsub.example.com/discovery-feed" };
    throw new Error(`Resource '${key}' not available`);
  }),
  createQueueService: () => ({
    sendMessage: mockSendMessage,
    sendMessageBatch: vi.fn(),
    purge: vi.fn(),
    getStats: vi.fn(),
  }),
}));

import {
  enqueueForReprocess,
  REPROCESS_CHUNK_SIZE,
} from "./discovery-reprocess.js";

function makeDiscoveries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://usopc.org/stuck-${i}`,
    title: `Stuck ${i}`,
  }));
}

describe("enqueueForReprocess", () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue(undefined);
  });

  it("returns 0/0 for an empty list without contacting the queue", async () => {
    const result = await enqueueForReprocess([]);
    expect(result).toEqual({ queued: 0, failed: 0 });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("packs up to REPROCESS_CHUNK_SIZE URLs into each Pub/Sub message", async () => {
    const total = REPROCESS_CHUNK_SIZE * 2 + 3;
    const discoveries = makeDiscoveries(total);

    const result = await enqueueForReprocess(discoveries);

    const expectedChunks = Math.ceil(total / REPROCESS_CHUNK_SIZE);
    expect(mockSendMessage).toHaveBeenCalledTimes(expectedChunks);
    expect(result).toEqual({ queued: total, failed: 0 });

    for (const call of mockSendMessage.mock.calls) {
      const body = JSON.parse(call[1] as string);
      expect(body.urls.length).toBeLessThanOrEqual(REPROCESS_CHUNK_SIZE);
      expect(body.urls.length).toBeGreaterThan(0);
      for (const u of body.urls) {
        expect(u.discoveryMethod).toBe("manual");
        expect(u.discoveredFrom).toBe("admin-reprocess");
      }
    }
  });

  it("counts a failed chunk send as `failed = chunk.length`, not 1", async () => {
    const total = REPROCESS_CHUNK_SIZE + 2;
    mockSendMessage
      .mockRejectedValueOnce(new Error("Pub/Sub timeout"))
      .mockResolvedValueOnce(undefined);

    const result = await enqueueForReprocess(makeDiscoveries(total));

    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(result.queued + result.failed).toBe(total);
    // The rejected call was the first chunk (size REPROCESS_CHUNK_SIZE)
    expect(result.failed).toBe(REPROCESS_CHUNK_SIZE);
    expect(result.queued).toBe(total - REPROCESS_CHUNK_SIZE);
  });
});
