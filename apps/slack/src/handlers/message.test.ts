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
import { handleMessage, type SlackMessageEvent } from "./message.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  overrides: Partial<SlackMessageEvent> = {},
): SlackMessageEvent {
  return {
    type: "message",
    channel: "D123",
    user: "U456",
    text: "What are the eligibility rules?",
    ts: "1234567890.123456",
    channel_type: "im",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleMessage", () => {
  const fakeRunner = {
    invoke: vi.fn().mockResolvedValue({
      answer: "Eligibility is determined by the NGB.",
      citations: [],
      escalation: undefined,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppRunner.mockResolvedValue(fakeRunner);
  });

  it("acknowledges immediately and invokes the agent asynchronously", async () => {
    await handleMessage(makeEvent());

    // Reaction is added synchronously before returning
    expect(mockAddReaction).toHaveBeenCalledWith(
      "D123",
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
        "D123",
        "Eligibility is determined by the NGB.",
        expect.any(Array),
        "1234567890.123456",
      );
    });
  });

  it("ignores non-DM messages", async () => {
    await handleMessage(makeEvent({ channel_type: "channel" }));

    expect(fakeRunner.invoke).not.toHaveBeenCalled();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it("ignores empty text", async () => {
    await handleMessage(makeEvent({ text: "   " }));

    expect(fakeRunner.invoke).not.toHaveBeenCalled();
  });

  it("ignores missing text", async () => {
    await handleMessage(makeEvent({ text: "" }));

    expect(fakeRunner.invoke).not.toHaveBeenCalled();
  });

  it("uses thread_ts as conversationId and reply target", async () => {
    await handleMessage(makeEvent({ thread_ts: "1111111111.000000" }));

    await vi.waitFor(() => {
      expect(fakeRunner.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "1111111111.000000",
        }),
      );
    });

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        "D123",
        expect.any(String),
        expect.any(Array),
        "1111111111.000000",
      );
    });
  });

  it("denies access when user is not on the invite list", async () => {
    vi.mocked(isUserInvited).mockResolvedValueOnce(false);

    await handleMessage(makeEvent());

    expect(mockPostMessage).toHaveBeenCalledWith(
      "D123",
      expect.stringContaining("don't have access"),
      undefined,
      "1234567890.123456",
    );
    expect(mockAddReaction).not.toHaveBeenCalled();
    expect(fakeRunner.invoke).not.toHaveBeenCalled();
  });

  it("posts an error block when the agent throws", async () => {
    fakeRunner.invoke.mockRejectedValueOnce(new Error("Agent down"));

    await handleMessage(makeEvent());

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        "D123",
        "Error processing request",
        expect.any(Array),
        "1234567890.123456",
      );
    });
  });
});
