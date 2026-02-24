import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockHandleMessage, mockHandleMention } = vi.hoisted(() => ({
  mockHandleMessage: vi.fn().mockResolvedValue(undefined),
  mockHandleMention: vi.fn().mockResolvedValue(undefined),
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

vi.mock("./message.js", () => ({
  handleMessage: mockHandleMessage,
}));

vi.mock("./mention.js", () => ({
  handleMention: mockHandleMention,
}));

import { dispatchEvent } from "./events.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dispatchEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responds to url_verification with the challenge", async () => {
    const result = await dispatchEvent({
      type: "url_verification",
      challenge: "test-challenge-token",
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      challenge: "test-challenge-token",
    });
  });

  it("dispatches message events to handleMessage", async () => {
    const event = {
      type: "message",
      channel: "D123",
      user: "U456",
      text: "Hello",
      ts: "1234567890.123456",
      channel_type: "im",
    };

    const result = await dispatchEvent({
      type: "event_callback",
      event,
    });

    expect(result.statusCode).toBe(200);
    expect(mockHandleMessage).toHaveBeenCalledWith(event);
  });

  it("dispatches app_mention events to handleMention", async () => {
    const event = {
      type: "app_mention",
      channel: "C123",
      user: "U456",
      text: "<@BOT> question",
      ts: "1234567890.123456",
    };

    const result = await dispatchEvent({
      type: "event_callback",
      event,
    });

    expect(result.statusCode).toBe(200);
    expect(mockHandleMention).toHaveBeenCalledWith(event);
  });

  it("ignores bot messages to prevent loops", async () => {
    const result = await dispatchEvent({
      type: "event_callback",
      event: {
        type: "message",
        bot_id: "B123",
        text: "Bot message",
      },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("ok");
    expect(mockHandleMessage).not.toHaveBeenCalled();
  });

  it("ignores bot_message subtype", async () => {
    const result = await dispatchEvent({
      type: "event_callback",
      event: {
        type: "message",
        subtype: "bot_message",
        text: "Bot message",
      },
    });

    expect(result.statusCode).toBe(200);
    expect(mockHandleMessage).not.toHaveBeenCalled();
  });

  it("returns ok for unknown event types", async () => {
    const result = await dispatchEvent({
      type: "event_callback",
      event: { type: "reaction_added" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("ok");
    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockHandleMention).not.toHaveBeenCalled();
  });

  it("returns ok for non-event_callback payloads", async () => {
    const result = await dispatchEvent({ type: "unknown_type" });

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("ok");
  });

  it("returns ok and logs warning when message event has invalid payload", async () => {
    const result = await dispatchEvent({
      type: "event_callback",
      event: {
        type: "message",
        // Missing required fields: channel, user, text, ts, channel_type
      },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("ok");
    expect(mockHandleMessage).not.toHaveBeenCalled();
  });

  it("returns ok and logs warning when mention event has invalid payload", async () => {
    const result = await dispatchEvent({
      type: "event_callback",
      event: {
        type: "app_mention",
        // Missing required fields: channel, user, text, ts
      },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("ok");
    expect(mockHandleMention).not.toHaveBeenCalled();
  });

  it("ignores Slack event retries to prevent duplicate agent responses", async () => {
    const result = await dispatchEvent(
      {
        type: "event_callback",
        event: {
          type: "message",
          channel: "D123",
          user: "U456",
          text: "Hello",
          ts: "1234567890.123456",
        },
      },
      1,
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("ok");
    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockHandleMention).not.toHaveBeenCalled();
  });
});
