import { describe, it, expect, vi } from "vitest";
import { withTimeout, TimeoutError } from "./withTimeout.js";

describe("TimeoutError", () => {
  it("stores operationName and timeoutMs", () => {
    const err = new TimeoutError("graph.invoke", 5000);
    expect(err.operationName).toBe("graph.invoke");
    expect(err.timeoutMs).toBe(5000);
    expect(err.name).toBe("TimeoutError");
    expect(err.message).toContain("graph.invoke");
    expect(err.message).toContain("5000");
  });

  it("is an instance of Error", () => {
    const err = new TimeoutError("op", 100);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("withTimeout", () => {
  it("resolves when the promise completes before timeout", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000, "fast-op");
    expect(result).toBe("ok");
  });

  it("rejects with TimeoutError when the promise takes too long", async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 5000);
    });

    await expect(withTimeout(slow, 50, "slow-op")).rejects.toThrow(
      TimeoutError,
    );
  });

  it("includes operation name in TimeoutError", async () => {
    const slow = new Promise<void>(() => {});

    try {
      await withTimeout(slow, 50, "my-operation");
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as TimeoutError).operationName).toBe("my-operation");
      expect((error as TimeoutError).timeoutMs).toBe(50);
    }
  });

  it("propagates the original rejection when promise rejects before timeout", async () => {
    const failing = Promise.reject(new Error("original error"));

    await expect(withTimeout(failing, 5000, "failing-op")).rejects.toThrow(
      "original error",
    );
  });

  it("clears the timer when the promise resolves", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    const promise = withTimeout(Promise.resolve(42), 1000, "op");
    await vi.runAllTimersAsync();
    await promise;

    expect(clearSpy).toHaveBeenCalled();

    clearSpy.mockRestore();
    vi.useRealTimers();
  });
});
