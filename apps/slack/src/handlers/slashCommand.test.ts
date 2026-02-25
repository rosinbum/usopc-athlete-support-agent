import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn().mockResolvedValue(undefined),
}));

const { mockGetAppRunner } = vi.hoisted(() => ({
  mockGetAppRunner: vi.fn(),
}));

const { mockIsUserInvited } = vi.hoisted(() => ({
  mockIsUserInvited: vi.fn().mockResolvedValue(true),
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
  convertMessages: vi
    .fn()
    .mockImplementation((msgs: { role: string; content: string }[]) =>
      msgs.map((m) => ({ content: m.content })),
    ),
}));

vi.mock("../slack/client.js", () => ({
  postMessage: mockPostMessage,
}));

vi.mock("../slack/blocks.js", () => ({
  buildAnswerBlocks: vi
    .fn()
    .mockReturnValue([{ type: "section", text: { type: "mrkdwn", text: "" } }]),
  buildErrorBlocks: vi
    .fn()
    .mockReturnValue([{ type: "section", text: { type: "mrkdwn", text: "" } }]),
}));

vi.mock("../lib/inviteGuard.js", () => ({
  isUserInvited: mockIsUserInvited,
}));

import { handleSlashCommand, type SlackSlashCommand } from "./slashCommand.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommand(
  overrides: Partial<SlackSlashCommand> = {},
): SlackSlashCommand {
  return {
    command: "/ask-athlete-support",
    text: "What are the appeal deadlines?",
    response_url: "https://hooks.slack.com/response",
    trigger_id: "T123",
    user_id: "U456",
    user_name: "testuser",
    channel_id: "C789",
    channel_name: "general",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleSlashCommand", () => {
  const fakeRunner = {
    invoke: vi.fn().mockResolvedValue({
      answer: "Appeals must be filed within 30 days.",
      citations: [],
      escalation: undefined,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppRunner.mockResolvedValue(fakeRunner);
  });

  it("returns immediate ephemeral acknowledgement", async () => {
    const response = await handleSlashCommand(makeCommand());

    expect(response.response_type).toBe("ephemeral");
    expect(response.text).toContain("Looking into that");
  });

  it("returns error for empty text", async () => {
    const response = await handleSlashCommand(makeCommand({ text: "" }));

    expect(response.response_type).toBe("ephemeral");
    expect(response.text).toContain("Please include a question");
    expect(fakeRunner.invoke).not.toHaveBeenCalled();
  });

  it("invokes the agent asynchronously and posts the answer", async () => {
    await handleSlashCommand(makeCommand());

    // Wait for the async processing to complete
    await vi.waitFor(() => {
      expect(fakeRunner.invoke).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        "C789",
        expect.stringContaining("Appeals must be filed"),
        expect.any(Array),
      );
    });
  });

  it("includes user mention and query in the posted answer", async () => {
    await handleSlashCommand(makeCommand());

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        "C789",
        expect.stringContaining("<@U456>"),
        expect.any(Array),
      );
    });
  });

  it("posts an error block when the agent throws", async () => {
    fakeRunner.invoke.mockRejectedValueOnce(new Error("Agent down"));

    await handleSlashCommand(makeCommand());

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        "C789",
        "Error processing request",
        expect.any(Array),
      );
    });
  });

  describe("invite guard (SEC-03)", () => {
    it("denies access when user is not on the invite list", async () => {
      mockIsUserInvited.mockResolvedValueOnce(false);

      const response = await handleSlashCommand(makeCommand());

      expect(response.response_type).toBe("ephemeral");
      expect(response.text).toContain("don't have access");
      expect(fakeRunner.invoke).not.toHaveBeenCalled();
    });

    it("calls isUserInvited with the user_id", async () => {
      await handleSlashCommand(makeCommand({ user_id: "U999" }));

      expect(mockIsUserInvited).toHaveBeenCalledWith("U999");
    });

    it("skips invite check for empty text (returns usage help first)", async () => {
      const response = await handleSlashCommand(makeCommand({ text: "" }));

      expect(response.text).toContain("Please include a question");
      expect(mockIsUserInvited).not.toHaveBeenCalled();
    });
  });
});
