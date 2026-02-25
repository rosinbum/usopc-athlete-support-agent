import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("./middleware/verify.js", () => ({
  verifySlackRequest: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock("./handlers/events.js", () => ({
  dispatchEvent: vi.fn(),
}));

vi.mock("./handlers/slashCommand.js", () => ({
  handleSlashCommand: vi.fn(),
}));

vi.mock("./slack/client.js", () => ({
  postMessage: vi.fn(),
}));

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    createFeedbackEntity: vi.fn(() => ({
      create: vi.fn(),
    })),
  };
});

import { app } from "./index.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function interactionRequest(payload: unknown): Request {
  const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  return new Request("http://localhost/slack/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

// ---------------------------------------------------------------------------
// Tests — Slack interaction payload validation (SEC-08)
// ---------------------------------------------------------------------------

describe("POST /slack/interactions — payload validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:false for malformed JSON", async () => {
    const req = new Request("http://localhost/slack/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "payload=%7Bnot-valid-json",
    });

    const res = await app.request(req);
    const body = (await res.json()) as { ok: boolean };

    expect(body.ok).toBe(false);
  });

  it("returns ok:false for payload missing required type field", async () => {
    const res = await app.request(interactionRequest({ user: { id: "U123" } }));
    const body = (await res.json()) as { ok: boolean };

    expect(body.ok).toBe(false);
  });

  it("returns ok:true for valid block_actions payload", async () => {
    const res = await app.request(
      interactionRequest({
        type: "block_actions",
        user: { id: "U123" },
        channel: { id: "C456" },
        actions: [],
      }),
    );
    const body = (await res.json()) as { ok: boolean };

    expect(body.ok).toBe(true);
  });

  it("returns ok:false when type is not a string", async () => {
    const res = await app.request(interactionRequest({ type: 123 }));
    const body = (await res.json()) as { ok: boolean };

    expect(body.ok).toBe(false);
  });
});
