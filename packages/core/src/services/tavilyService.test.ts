import { describe, it, expect, vi, beforeEach } from "vitest";

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

import type { TavilySearchLike } from "./tavilyService.js";
import {
  searchWithTavily,
  searchWithTavilyFallback,
  getTavilyCircuitMetrics,
  resetTavilyCircuit,
} from "./tavilyService.js";
import { CircuitBreakerError } from "@usopc/shared";

function makeMockSearch(result: unknown = { results: [] }): TavilySearchLike {
  return { invoke: vi.fn().mockResolvedValue(result) };
}

describe("tavilyService", () => {
  beforeEach(() => {
    resetTavilyCircuit();
  });

  describe("searchWithTavily", () => {
    it("calls search.invoke with the query and returns the result", async () => {
      const search = makeMockSearch({
        results: [{ url: "https://example.com" }],
      });
      const result = await searchWithTavily(search, "test query");
      expect(vi.mocked(search.invoke)).toHaveBeenCalledWith({
        query: "test query",
      });
      expect(result).toEqual({ results: [{ url: "https://example.com" }] });
    });

    it("propagates errors from the underlying search", async () => {
      const search: TavilySearchLike = {
        invoke: vi.fn().mockRejectedValue(new Error("Search API error")),
      };
      await expect(searchWithTavily(search, "query")).rejects.toThrow(
        "Search API error",
      );
    });

    it("opens the circuit after 3 consecutive failures", async () => {
      const search: TavilySearchLike = {
        invoke: vi.fn().mockRejectedValue(new Error("Search API error")),
      };

      for (let i = 0; i < 3; i++) {
        await expect(searchWithTavily(search, "query")).rejects.toThrow(
          "Search API error",
        );
      }

      expect(getTavilyCircuitMetrics().state).toBe("open");
    });

    it("throws CircuitBreakerError when circuit is open", async () => {
      const failingSearch: TavilySearchLike = {
        invoke: vi.fn().mockRejectedValue(new Error("fail")),
      };

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(searchWithTavily(failingSearch, "q")).rejects.toThrow();
      }

      const newSearch = makeMockSearch();
      await expect(searchWithTavily(newSearch, "q")).rejects.toThrow(
        CircuitBreakerError,
      );
    });
  });

  describe("searchWithTavilyFallback", () => {
    it("returns search result on success", async () => {
      const search = makeMockSearch("search results");
      const result = await searchWithTavilyFallback(search, "query");
      expect(result).toBe("search results");
    });

    it("returns empty string fallback when circuit is open", async () => {
      const failingSearch: TavilySearchLike = {
        invoke: vi.fn().mockRejectedValue(new Error("fail")),
      };

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(searchWithTavily(failingSearch, "q")).rejects.toThrow();
      }

      const newSearch = makeMockSearch("results");
      const result = await searchWithTavilyFallback(newSearch, "q");
      expect(result).toBe("");
    });

    it("returns empty string fallback when search fails", async () => {
      const search: TavilySearchLike = {
        invoke: vi.fn().mockRejectedValue(new Error("API down")),
      };
      // failureThreshold=3; single call should still return fallback via executeWithFallback
      const result = await searchWithTavilyFallback(search, "q");
      expect(result).toBe("");
    });
  });

  describe("getTavilyCircuitMetrics", () => {
    it("returns closed state initially", () => {
      const metrics = getTavilyCircuitMetrics();
      expect(metrics.state).toBe("closed");
    });

    it("reflects failure count after failures", async () => {
      const search: TavilySearchLike = {
        invoke: vi.fn().mockRejectedValue(new Error("fail")),
      };
      await expect(searchWithTavily(search, "q")).rejects.toThrow();
      await expect(searchWithTavily(search, "q")).rejects.toThrow();

      // consecutiveFailures is reset by resetTavilyCircuit(); totalFailures is
      // a lifetime counter that persists across resets (module-level singleton)
      const metrics = getTavilyCircuitMetrics();
      expect(metrics.consecutiveFailures).toBe(2);
    });
  });

  describe("resetTavilyCircuit", () => {
    it("resets an open circuit back to closed", async () => {
      const search: TavilySearchLike = {
        invoke: vi.fn().mockRejectedValue(new Error("fail")),
      };

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(searchWithTavily(search, "q")).rejects.toThrow();
      }
      expect(getTavilyCircuitMetrics().state).toBe("open");

      resetTavilyCircuit();

      expect(getTavilyCircuitMetrics().state).toBe("closed");
    });
  });
});
