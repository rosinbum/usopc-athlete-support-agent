import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import {
  isTransientError,
  withSingleRetry,
  invokeLlm,
  invokeLlmWithFallback,
  getLlmCircuitMetrics,
  resetLlmCircuit,
} from "./llmService.js";
import { CircuitBreakerError } from "@usopc/shared";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";

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
    const fn = vi.fn().mockRejectedValue(new CircuitBreakerError("llm"));

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
// invokeLlm / invokeLlmWithFallback — circuit wrapper
// ---------------------------------------------------------------------------

function makeMockModel(result: AIMessage): BaseChatModel {
  return {
    invoke: vi.fn().mockResolvedValue(result),
  } as unknown as BaseChatModel;
}

function makeFailingModel(error = new Error("LLM error")): BaseChatModel {
  return {
    invoke: vi.fn().mockRejectedValue(error),
  } as unknown as BaseChatModel;
}

const fakeResponse = { content: "Hello" } as AIMessage;

describe("invokeLlm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetLlmCircuit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the model response when the call succeeds", async () => {
    const model = makeMockModel(fakeResponse);
    const result = await invokeLlm(model, []);
    expect(result).toBe(fakeResponse);
  });

  it("passes the messages array to the model", async () => {
    const model = makeMockModel(fakeResponse);
    const messages = [] as BaseMessage[];
    await invokeLlm(model, messages);
    expect(vi.mocked(model.invoke)).toHaveBeenCalledWith(messages);
  });

  it("opens the circuit after 3 consecutive failures", async () => {
    const model = makeFailingModel();
    for (let i = 0; i < 3; i++) {
      await expect(invokeLlm(model, [])).rejects.toThrow();
    }
    expect(getLlmCircuitMetrics().state).toBe("open");
  });

  it("throws CircuitBreakerError when circuit is open", async () => {
    const failingModel = makeFailingModel();
    for (let i = 0; i < 3; i++) {
      await expect(invokeLlm(failingModel, [])).rejects.toThrow();
    }

    const goodModel = makeMockModel(fakeResponse);
    await expect(invokeLlm(goodModel, [])).rejects.toThrow(CircuitBreakerError);
  });

  it("resets consecutive failure count on success", async () => {
    const failingModel = makeFailingModel();
    await expect(invokeLlm(failingModel, [])).rejects.toThrow();
    await expect(invokeLlm(failingModel, [])).rejects.toThrow();

    const goodModel = makeMockModel(fakeResponse);
    await invokeLlm(goodModel, []);

    expect(getLlmCircuitMetrics().consecutiveFailures).toBe(0);
  });
});

describe("invokeLlmWithFallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetLlmCircuit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns model response on success", async () => {
    const model = makeMockModel(fakeResponse);
    const fallback = { content: "fallback" } as AIMessage;
    const result = await invokeLlmWithFallback(model, [], fallback);
    expect(result).toBe(fakeResponse);
  });

  it("returns static fallback when circuit is open", async () => {
    const failingModel = makeFailingModel();
    for (let i = 0; i < 3; i++) {
      await expect(invokeLlm(failingModel, [])).rejects.toThrow();
    }

    const fallback = { content: "fallback" } as AIMessage;
    const goodModel = makeMockModel(fakeResponse);
    const result = await invokeLlmWithFallback(goodModel, [], fallback);
    expect(result).toBe(fallback);
  });

  it("calls fallback function when circuit is open", async () => {
    const failingModel = makeFailingModel();
    for (let i = 0; i < 3; i++) {
      await expect(invokeLlm(failingModel, [])).rejects.toThrow();
    }

    const fallbackFn = vi.fn().mockReturnValue(fakeResponse);
    const goodModel = makeMockModel({ content: "other" } as AIMessage);
    const result = await invokeLlmWithFallback(goodModel, [], fallbackFn);

    expect(fallbackFn).toHaveBeenCalled();
    expect(result).toBe(fakeResponse);
  });
});
