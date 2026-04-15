import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    logger: {
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
    createQueueService: () => ({
      sendMessage: mockSendMessage,
      sendMessageBatch: vi.fn(),
      purge: vi.fn(),
      getStats: vi.fn(),
    }),
  };
});

import { publishDiscoveredUrls } from "./discoveryFeedService.js";
import type { WebSearchResult } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResults(
  ...entries: (string | { url: string; score: number })[]
): WebSearchResult[] {
  return entries.map((entry, i) => {
    const url = typeof entry === "string" ? entry : entry.url;
    const score = typeof entry === "string" ? 0.8 : entry.score;
    return {
      url,
      title: `Title ${i}`,
      content: `Content ${i}`,
      score,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("publishDiscoveredUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early for empty input without sending queue message", async () => {
    await publishDiscoveredUrls(
      [],
      "https://sqs.us-east-1.amazonaws.com/queue",
    );

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("sends queue message with correct queue URL", async () => {
    const results = makeResults("https://usopc.org/doc1");
    const queueUrl = "https://sqs.us-east-1.amazonaws.com/test-queue";

    await publishDiscoveredUrls(results, queueUrl);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(queueUrl, expect.any(String));
  });

  it("message body contains all URL fields", async () => {
    const results = makeResults(
      "https://usopc.org/doc1",
      "https://teamusa.org/doc2",
    );

    await publishDiscoveredUrls(
      results,
      "https://sqs.us-east-1.amazonaws.com/queue",
    );

    const messageBody = mockSendMessage.mock.calls[0]![1] as string;
    const body = JSON.parse(messageBody);

    expect(body.urls).toHaveLength(2);
    expect(body.urls[0]).toEqual({
      url: "https://usopc.org/doc1",
      title: "Title 0",
      discoveryMethod: "agent",
      discoveredFrom: "agent-web-search",
    });
    expect(body.urls[1]).toEqual({
      url: "https://teamusa.org/doc2",
      title: "Title 1",
      discoveryMethod: "agent",
      discoveredFrom: "agent-web-search",
    });
    expect(body.timestamp).toBeDefined();
  });

  it("does not throw on queue errors", async () => {
    mockSendMessage.mockRejectedValueOnce(new Error("SQS error"));
    const results = makeResults("https://usopc.org/doc1");

    await expect(
      publishDiscoveredUrls(
        results,
        "https://sqs.us-east-1.amazonaws.com/queue",
      ),
    ).resolves.toBeUndefined();
  });
});
