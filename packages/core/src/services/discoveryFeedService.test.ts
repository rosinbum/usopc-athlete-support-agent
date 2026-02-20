import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSqsSend } = vi.hoisted(() => ({
  mockSqsSend: vi.fn().mockResolvedValue({}),
}));

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn(() => ({ send: mockSqsSend })),
  SendMessageCommand: vi.fn(),
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
  };
});

import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { publishDiscoveredUrls } from "./discoveryFeedService.js";
import type { WebSearchResult } from "../types/index.js";

const MockSendMessageCommand = vi.mocked(SendMessageCommand);

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

  it("returns early for empty input without sending SQS message", async () => {
    await publishDiscoveredUrls(
      [],
      "https://sqs.us-east-1.amazonaws.com/queue",
    );

    expect(mockSqsSend).not.toHaveBeenCalled();
  });

  it("sends SQS message with correct queue URL", async () => {
    const results = makeResults("https://usopc.org/doc1");
    const queueUrl = "https://sqs.us-east-1.amazonaws.com/test-queue";

    await publishDiscoveredUrls(results, queueUrl);

    expect(mockSqsSend).toHaveBeenCalledTimes(1);
    expect(MockSendMessageCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        QueueUrl: queueUrl,
      }),
    );
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

    const commandArg = MockSendMessageCommand.mock.calls[0]![0]!;
    const body = JSON.parse(commandArg.MessageBody!);

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

  it("does not throw on SQS errors", async () => {
    mockSqsSend.mockRejectedValueOnce(new Error("SQS error"));
    const results = makeResults("https://usopc.org/doc1");

    await expect(
      publishDiscoveredUrls(
        results,
        "https://sqs.us-east-1.amazonaws.com/queue",
      ),
    ).resolves.toBeUndefined();
  });
});
