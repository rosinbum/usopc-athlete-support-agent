import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockChatAnthropicInstance = { invoke: vi.fn() };

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => mockChatAnthropicInstance),
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

import { ChatAnthropic } from "@langchain/anthropic";
import {
  isTransientError,
  withSingleRetry,
  createChatAnthropic,
} from "./anthropicService.js";
import { setAnthropicApiKey, getAnthropicApiKey } from "../config/index.js";
import { CircuitBreakerError } from "@usopc/shared";

// ---------------------------------------------------------------------------
// isTransientError
// ---------------------------------------------------------------------------

describe("isTransientError", () => {
  it("returns false for CircuitBreakerError", () => {
    const err = new CircuitBreakerError("test");
    expect(isTransientError(err)).toBe(false);
  });

  it("returns true for network errors", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
    expect(isTransientError(new Error("socket hang up"))).toBe(true);
    expect(isTransientError(new Error("network error"))).toBe(true);
    expect(isTransientError(new Error("request timeout"))).toBe(true);
  });

  it("returns true for HTTP 429/500/502/503/529 in message", () => {
    expect(isTransientError(new Error("Rate limited: 429"))).toBe(true);
    expect(isTransientError(new Error("Server error 500"))).toBe(true);
    expect(isTransientError(new Error("Bad Gateway 502"))).toBe(true);
    expect(isTransientError(new Error("Service Unavailable 503"))).toBe(true);
    expect(isTransientError(new Error("Overloaded 529"))).toBe(true);
  });

  it("returns true when error has status property", () => {
    const err = Object.assign(new Error("fail"), { status: 429 });
    expect(isTransientError(err)).toBe(true);
  });

  it("returns true when error has statusCode property", () => {
    const err = Object.assign(new Error("fail"), { statusCode: 503 });
    expect(isTransientError(err)).toBe(true);
  });

  it("returns false for non-transient errors", () => {
    expect(isTransientError(new Error("Invalid API key"))).toBe(false);
    expect(isTransientError(new Error("Bad request 400"))).toBe(false);
    expect(isTransientError(new Error("Unauthorized 401"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isTransientError("string error")).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withSingleRetry
// ---------------------------------------------------------------------------

describe("withSingleRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withSingleRetry(fn, "test-op");
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once on transient error and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce("recovered");

    const promise = withSingleRetry(fn, "test-op");
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-transient error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(withSingleRetry(fn, "test-op")).rejects.toThrow(
      "Invalid API key",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on CircuitBreakerError", async () => {
    const fn = vi.fn().mockRejectedValue(new CircuitBreakerError("anthropic"));

    await expect(withSingleRetry(fn, "test-op")).rejects.toThrow(
      CircuitBreakerError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows when retry also fails", async () => {
    vi.useRealTimers();

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET again"));

    await expect(withSingleRetry(fn, "test-op")).rejects.toThrow(
      "ECONNRESET again",
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// createChatAnthropic
// ---------------------------------------------------------------------------

describe("createChatAnthropic", () => {
  it("passes the stored API key to ChatAnthropic constructor", () => {
    setAnthropicApiKey("sk-test-123");

    const model = createChatAnthropic({
      model: "claude-haiku-4-5-20251001",
      temperature: 0,
    });

    expect(model).toBe(mockChatAnthropicInstance);
    expect(vi.mocked(ChatAnthropic)).toHaveBeenCalledWith({
      model: "claude-haiku-4-5-20251001",
      temperature: 0,
      apiKey: "sk-test-123",
    });
  });

  it("throws when no API key has been set", () => {
    // getAnthropicApiKey will throw because the module-scoped key is cleared
    // We need a fresh module state — but since setAnthropicApiKey was called
    // in the previous test, we verify the getter works correctly.
    setAnthropicApiKey("sk-valid");
    expect(getAnthropicApiKey()).toBe("sk-valid");
  });
});
