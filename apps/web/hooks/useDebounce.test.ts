import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "./useDebounce.js";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 100));
    expect(result.current).toBe("hello");
  });

  it("does not update the value before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "updated" });
    // Still shows initial before delay
    expect(result.current).toBe("initial");
  });

  it("updates to the new value after the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "updated" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe("updated");
  });

  it("skips intermediate values when multiple updates occur within the delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender({ value: "c" });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // Delay reset — value still not updated
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Final value after delay
    expect(result.current).toBe("c");
  });

  it("works with number values", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 16),
      { initialProps: { value: 0 } },
    );

    rerender({ value: 42 });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current).toBe(42);
  });
});
