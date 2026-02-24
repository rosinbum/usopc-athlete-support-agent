import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import type { Context, Next } from "hono";
import { verifySlackRequest, MAX_PAYLOAD_BYTES } from "./verify.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = "test-signing-secret";
const TEST_BODY = '{"type":"event_callback"}';

function computeSignature(timestamp: string, body: string): string {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", TEST_SECRET);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest("hex")}`;
}

function makeContext({
  timestamp,
  signature,
  body = TEST_BODY,
}: {
  timestamp?: string;
  signature?: string;
  body?: string;
}) {
  const variables = new Map<string, unknown>();
  const headers: Record<string, string | undefined> = {};
  if (timestamp !== undefined) headers["x-slack-request-timestamp"] = timestamp;
  if (signature !== undefined) headers["x-slack-signature"] = signature;

  const ctx = {
    req: {
      header: (name: string) => headers[name],
      text: vi.fn().mockResolvedValue(body),
    },
    set: (key: string, value: unknown) => variables.set(key, value),
    json: (data: unknown, status: number) =>
      new Response(JSON.stringify(data), { status }),
  } as unknown as Context<{ Variables: { rawBody: string } }>;

  return { ctx, variables };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("verifySlackRequest", () => {
  beforeEach(() => {
    process.env.SLACK_SIGNING_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.SLACK_SIGNING_SECRET;
  });

  it("returns 401 when x-slack-request-timestamp header is missing", async () => {
    const { ctx } = makeContext({ signature: "v0=" + "a".repeat(64) });
    const next = vi.fn();

    const result = await verifySlackRequest(ctx, next as unknown as Next);

    expect((result as Response).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when x-slack-signature header is missing", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { ctx } = makeContext({ timestamp });
    const next = vi.fn();

    const result = await verifySlackRequest(ctx, next as unknown as Next);

    expect((result as Response).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when timestamp is older than 5 minutes", async () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const { ctx } = makeContext({
      timestamp: oldTimestamp,
      signature: computeSignature(oldTimestamp, TEST_BODY),
    });
    const next = vi.fn();

    const result = await verifySlackRequest(ctx, next as unknown as Next);

    expect((result as Response).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when HMAC signature is wrong", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { ctx } = makeContext({
      timestamp,
      // Same length as a real HMAC signature but wrong value
      signature: "v0=" + "0".repeat(64),
    });
    const next = vi.fn();

    const result = await verifySlackRequest(ctx, next as unknown as Next);

    expect((result as Response).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 413 when payload exceeds size limit", async () => {
    const oversizedBody = "x".repeat(MAX_PAYLOAD_BYTES + 1);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { ctx } = makeContext({
      timestamp,
      signature: computeSignature(timestamp, oversizedBody),
      body: oversizedBody,
    });
    const next = vi.fn();

    const result = await verifySlackRequest(ctx, next as unknown as Next);

    expect((result as Response).status).toBe(413);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() and sets rawBody when signature is valid", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { ctx, variables } = makeContext({
      timestamp,
      signature: computeSignature(timestamp, TEST_BODY),
    });
    const next = vi.fn().mockResolvedValue(undefined);

    await verifySlackRequest(ctx, next as unknown as Next);

    expect(next).toHaveBeenCalledOnce();
    expect(variables.get("rawBody")).toBe(TEST_BODY);
  });
});
