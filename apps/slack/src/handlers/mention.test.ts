import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockPostMessage, mockAddReaction } = vi.hoisted(() => ({
  mockPostMessage: vi.fn().mockResolvedValue(undefined),
  mockAddReaction: vi.fn().mockResolvedValue(undefined),
}));

const { mockGetAppRunner, mockLoadSummary } = vi.hoisted(() => ({
  mockGetAppRunner: vi.fn(),
  mockLoadSummary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

vi.mock("@usopc/core", () => ({
  getAppRunner: mockGetAppRunner,
  loadSummary: mockLoadSummary,
  convertMessages: vi
    .fn()
    .mockImplementation((msgs: { role: string; content: string }[]) =>
      msgs.map((m) => ({ content: m.content })),
    ),
}));

vi.mock("../slack/client.js", () => ({
  postMessage: mockPostMessage,
  addReaction: mockAddReaction,
}));

vi.mock("../slack/blocks.js", () => ({
  buildAnswerBlocks: vi
    .fn()
    .mockReturnValue([{ type: "section", text: { type: "mrkdwn", text: "" } }]),
  buildErrorBlocks: vi
    .fn()
    .mockReturnValue([{ type: "section", text: { type: "mrkdwn", text: "" } }]),
}));

// Default: all users are invited (override per-test as needed)
vi.mock("../lib/inviteGuard.js", () => ({
  isUserInvited: vi.fn().mockResolvedValue(true),
}));

import { isUserInvited } from "../lib/inviteGuard.js";
import { handleMention, type SlackMentionEvent } from "./mention.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  overrides: Partial<SlackMentionEvent> = {},
): SlackMentionEvent {
  return {
    type: "app_mention",
    channel: "C123",
    user: "U456",
    text: "<@BOT123> What are the appeal deadlines?",
    ts: "1234567890.123456",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleMention", () => {
  const fakeRunner = {
    invoke: vi.fn().mockResolvedValue({
      answer: "Appeals must be filed within 30 days.",
      citations: [{ title: "Bylaws", documentType: "policy", snippet: "..." }],
      escalation: undefined,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppRunner.mockResolvedValue(fakeRunner);
  });

  it("acknowledges immediately and invokes the agent asynchronously", async () => {
    await handleMention(makeEvent());

    // Reaction is added synchronously before returning
    expect(mockAddReaction).toHaveBeenCalledWith(
      "C123",
      "1234567890.123456",
      "eyes",
    );

    // Agent invocation and response happen asynchronously
    await vi.waitFor(() => {
      expect(fakeRunner.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "1234567890.123456",
        }),
      );
    });

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        "C123",
        "Appeals must be filed within 30 days.",
        expect.any(Array),
        "1234567890.123456",
      );
    });
  });

  it("uses thread_ts as conversationId when in a thread", async () => {
    await handleMention(makeEvent({ thread_ts: "1111111111.000000" }));

    await vi.waitFor(() => {
      expect(fakeRunner.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "1111111111.000000",
        }),
      );
    });

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        "C123",
        expect.any(String),
        expect.any(Array),
        "1111111111.000000",
      );
    });
  });

  it("asks for a question when text is empty after stripping mention", async () => {
    await handleMention(makeEvent({ text: "<@BOT123>  " }));

    expect(mockPostMessage).toHaveBeenCalledWith(
      "C123",
      expect.stringContaining("Please include a question"),
      undefined,
      "1234567890.123456",
    );
    expect(fakeRunner.invoke).not.toHaveBeenCalled();
  });

  it("denies access when user is not on the invite list", async () => {
    vi.mocked(isUserInvited).mockResolvedValueOnce(false);

    await handleMention(makeEvent());

    expect(mockPostMessage).toHaveBeenCalledWith(
      "C123",
      expect.stringContaining("don't have access"),
      undefined,
      "1234567890.123456",
    );
    expect(mockAddReaction).not.toHaveBeenCalled();
    expect(fakeRunner.invoke).not.toHaveBeenCalled();
  });

  it("posts an error block when the agent throws", async () => {
    fakeRunner.invoke.mockRejectedValueOnce(new Error("Agent down"));

    await handleMention(makeEvent());

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        "C123",
        "Error processing request",
        expect.any(Array),
        "1234567890.123456",
      );
    });
  });

  it("loads conversation summary for the thread", async () => {
    mockLoadSummary.mockResolvedValueOnce("Previous context about appeals.");

    await handleMention(makeEvent());

    await vi.waitFor(() => {
      expect(mockLoadSummary).toHaveBeenCalledWith("1234567890.123456");
    });

    await vi.waitFor(() => {
      expect(fakeRunner.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationSummary: "Previous context about appeals.",
        }),
      );
    });
  });
});
