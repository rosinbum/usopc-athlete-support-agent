import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn(),
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

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { publishDiscoveredUrls, normalizeUrl } from "./discoveryFeedService.js";
import type { WebSearchResult } from "../types/index.js";

const MockSQSClient = vi.mocked(SQSClient);
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

describe("normalizeUrl", () => {
  it("strips fragment", () => {
    expect(normalizeUrl("https://usopc.org/page#section")).toBe(
      "https://usopc.org/page",
    );
  });

  it("strips trailing slash on paths", () => {
    expect(normalizeUrl("https://usopc.org/page/")).toBe(
      "https://usopc.org/page",
    );
  });

  it("preserves root path trailing slash", () => {
    expect(normalizeUrl("https://usopc.org/")).toBe("https://usopc.org/");
  });

  it("strips www. prefix", () => {
    expect(normalizeUrl("https://www.usopc.org/page")).toBe(
      "https://usopc.org/page",
    );
  });

  it("handles all normalizations together", () => {
    expect(normalizeUrl("https://www.usopc.org/page/#section")).toBe(
      "https://usopc.org/page",
    );
  });

  it("returns invalid URLs as-is", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("publishDiscoveredUrls", () => {
  const mockSend = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    vi.clearAllMocks();
    MockSQSClient.mockImplementation(() => ({ send: mockSend }) as any);
  });

  it("returns early for empty input without sending SQS message", async () => {
    await publishDiscoveredUrls(
      [],
      "https://sqs.us-east-1.amazonaws.com/queue",
    );

    expect(MockSQSClient).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends SQS message with correct queue URL", async () => {
    const results = makeResults("https://usopc.org/doc1");
    const queueUrl = "https://sqs.us-east-1.amazonaws.com/test-queue";

    await publishDiscoveredUrls(results, queueUrl);

    expect(mockSend).toHaveBeenCalledTimes(1);
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

    const commandArg = MockSendMessageCommand.mock.calls[0][0];
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
    mockSend.mockRejectedValueOnce(new Error("SQS error"));
    const results = makeResults("https://usopc.org/doc1");

    await expect(
      publishDiscoveredUrls(
        results,
        "https://sqs.us-east-1.amazonaws.com/queue",
      ),
    ).resolves.toBeUndefined();
  });
});
