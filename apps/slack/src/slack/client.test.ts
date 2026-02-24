import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    getSecretValue: vi.fn(() => "xoxb-test-token"),
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

import { withRetry } from "./client.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("withRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, 2);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient rate limit error and succeeds", async () => {
    const rateLimitError = Object.assign(new Error("rate limited"), {
      code: "slack_webapi_rate_limited_error",
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 2);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on network timeout error", async () => {
    const timeoutError = Object.assign(new Error("timeout"), {
      code: "ETIMEDOUT",
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 2);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on connection reset error", async () => {
    const resetError = Object.assign(new Error("reset"), {
      code: "ECONNRESET",
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(resetError)
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 2);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on slack request error", async () => {
    const requestError = Object.assign(new Error("request failed"), {
      code: "slack_webapi_request_error",
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(requestError)
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 2);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient errors", async () => {
    const permanentError = new Error("channel_not_found");
    const fn = vi.fn().mockRejectedValue(permanentError);

    await expect(withRetry(fn, 2)).rejects.toThrow("channel_not_found");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting all retries", async () => {
    const rateLimitError = Object.assign(new Error("rate limited"), {
      code: "slack_webapi_rate_limited_error",
    });
    const fn = vi.fn().mockRejectedValue(rateLimitError);

    await expect(withRetry(fn, 2)).rejects.toThrow("rate limited");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry when maxRetries is 0", async () => {
    const rateLimitError = Object.assign(new Error("rate limited"), {
      code: "slack_webapi_rate_limited_error",
    });
    const fn = vi.fn().mockRejectedValue(rateLimitError);

    await expect(withRetry(fn, 0)).rejects.toThrow("rate limited");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
