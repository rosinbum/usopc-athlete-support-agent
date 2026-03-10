import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn();
vi.mock("@usopc/core", () => ({
  getAppRunner: vi.fn(async () => ({ invoke: mockInvoke })),
  convertMessages: vi.fn((msgs: unknown[]) => msgs),
}));

const mockPostMessage = vi.fn().mockResolvedValue("posted-ts");
const mockCleanUp = vi.fn().mockResolvedValue(undefined);
vi.mock("../slack/client.js", () => ({
  postMessage: (...args: unknown[]) => mockPostMessage(...args),
  cleanUpPreviousBotMessages: (...args: unknown[]) => mockCleanUp(...args),
}));

vi.mock("../slack/blocks.js", () => ({
  buildAnswerBlocks: vi.fn((answer: string) => [
    { type: "section", text: answer },
  ]),
  buildErrorBlocks: vi.fn((msg: string) => [{ type: "section", text: msg }]),
}));

import { processQuery, type ProcessQueryParams } from "./processQuery.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
};

function makeParams(
  overrides?: Partial<ProcessQueryParams>,
): ProcessQueryParams {
  return {
    text: "What are the selection criteria?",
    channel: "C123",
    user: "U456",
    replyTs: "1234567890.000",
    conversationId: "1234567890.000",
    logger: mockLogger as never,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes the runner and posts the answer", async () => {
    mockInvoke.mockResolvedValue({
      answer: "The criteria are...",
      citations: [],
      escalation: null,
      disclaimer: null,
    });

    await processQuery(makeParams());

    expect(mockInvoke).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "What are the selection criteria?" }],
      conversationId: "1234567890.000",
      userId: "slack:U456",
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      "C123",
      "The criteria are...",
      expect.any(Array),
      "1234567890.000",
    );
  });

  it("cleans up previous bot messages after posting", async () => {
    mockInvoke.mockResolvedValue({
      answer: "answer",
      citations: [],
      escalation: null,
      disclaimer: null,
    });

    await processQuery(makeParams());

    expect(mockCleanUp).toHaveBeenCalledWith(
      "C123",
      "1234567890.000",
      "posted-ts",
    );
  });

  it("posts an error message when the runner throws", async () => {
    mockInvoke.mockRejectedValue(new Error("Runner failed"));

    await processQuery(makeParams());

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to process query",
      expect.objectContaining({ error: "Runner failed" }),
    );

    expect(mockPostMessage).toHaveBeenCalledWith(
      "C123",
      "Error processing request",
      expect.any(Array),
      "1234567890.000",
    );
  });

  it("passes the correct userId with slack prefix", async () => {
    mockInvoke.mockResolvedValue({
      answer: "ok",
      citations: [],
      escalation: null,
      disclaimer: null,
    });

    await processQuery(makeParams({ user: "UABC" }));

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "slack:UABC" }),
    );
  });
});
