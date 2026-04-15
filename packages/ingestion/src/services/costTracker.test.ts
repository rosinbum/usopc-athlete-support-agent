import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Pool, QueryResult } from "pg";

// Mock the pool module
const mockQuery = vi.fn();
const mockPool = { query: mockQuery } as unknown as Pool;

vi.mock("@usopc/shared", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...orig,
    getPool: vi.fn(() => mockPool),
  };
});

import { CostTracker } from "./costTracker.js";

function makeQueryResult(rows: Record<string, unknown>[] = []): QueryResult {
  return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
}

describe("CostTracker", () => {
  let costTracker: CostTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue(makeQueryResult());
    costTracker = new CostTracker(mockPool);
  });

  describe("trackTavilyCall", () => {
    it("should track a search call with 1 credit", async () => {
      await costTracker.trackTavilyCall("search");

      // Should upsert all three periods (daily, weekly, monthly)
      expect(mockQuery).toHaveBeenCalledTimes(3);

      const firstCall = mockQuery.mock.calls[0]!;
      // Check params include tavily_calls=1, tavily_credits=1
      expect(firstCall[1][0]).toBe("tavily"); // service
      expect(firstCall[1][3]).toBe(1); // tavily_calls
      expect(firstCall[1][4]).toBe(1); // tavily_credits
    });

    it("should track a map call with 5 credits", async () => {
      await costTracker.trackTavilyCall("map");

      expect(mockQuery).toHaveBeenCalledTimes(3);

      const firstCall = mockQuery.mock.calls[0]!;
      expect(firstCall[1][3]).toBe(1); // tavily_calls
      expect(firstCall[1][4]).toBe(5); // tavily_credits
    });

    it("should handle query errors", async () => {
      mockQuery.mockRejectedValue(new Error("PG error"));

      await expect(costTracker.trackTavilyCall("search")).rejects.toThrow(
        "PG error",
      );
    });
  });

  describe("trackAnthropicCall", () => {
    it("should track call with token usage and cost", async () => {
      await costTracker.trackAnthropicCall(100_000, 50_000);

      expect(mockQuery).toHaveBeenCalledTimes(3);

      const firstCall = mockQuery.mock.calls[0]!;
      expect(firstCall[1][0]).toBe("anthropic");
      expect(firstCall[1][5]).toBe(1); // anthropic_calls
      expect(firstCall[1][6]).toBe(100_000); // input_tokens
      expect(firstCall[1][7]).toBe(50_000); // output_tokens
      // Cost: 100k/1M * $3 + 50k/1M * $15 = $0.30 + $0.75 = $1.05
      expect(firstCall[1][8]).toBeCloseTo(1.05, 2);
    });

    it("should handle zero tokens", async () => {
      await costTracker.trackAnthropicCall(0, 0);

      const firstCall = mockQuery.mock.calls[0]!;
      expect(firstCall[1][8]).toBe(0); // cost
    });
  });

  describe("getUsageStats", () => {
    it("should return Tavily stats for monthly period", async () => {
      mockQuery.mockResolvedValue(
        makeQueryResult([
          {
            service: "tavily",
            period: "monthly",
            date: "2026-02-01",
            tavily_calls: 10,
            tavily_credits: 25,
          },
        ]),
      );

      const stats = await costTracker.getUsageStats("tavily", "monthly");

      expect(stats).toMatchObject({
        service: "tavily",
        period: "monthly",
        tavily: {
          calls: 10,
          estimatedCredits: 25,
        },
      });
    });

    it("should return Anthropic stats for daily period", async () => {
      mockQuery.mockResolvedValue(
        makeQueryResult([
          {
            service: "anthropic",
            period: "daily",
            date: "2026-02-15",
            anthropic_calls: 5,
            anthropic_input_tokens: 100_000,
            anthropic_output_tokens: 50_000,
            anthropic_cost: 1.05,
          },
        ]),
      );

      const stats = await costTracker.getUsageStats("anthropic", "daily");

      expect(stats).toMatchObject({
        service: "anthropic",
        period: "daily",
        anthropic: {
          calls: 5,
          inputTokens: 100_000,
          outputTokens: 50_000,
          estimatedCost: 1.05,
        },
      });
    });

    it("should return zeros when no data exists", async () => {
      mockQuery.mockResolvedValue(makeQueryResult([]));

      const stats = await costTracker.getUsageStats("tavily", "monthly");

      expect(stats).toMatchObject({
        service: "tavily",
        period: "monthly",
        tavily: {
          calls: 0,
          estimatedCredits: 0,
        },
      });
    });

    it("should handle query errors", async () => {
      mockQuery.mockRejectedValue(new Error("PG error"));

      await expect(
        costTracker.getUsageStats("tavily", "monthly"),
      ).rejects.toThrow("PG error");
    });
  });

  describe("checkBudget", () => {
    beforeEach(() => {
      process.env.TAVILY_MONTHLY_BUDGET = "1000";
      process.env.ANTHROPIC_MONTHLY_BUDGET = "10";
    });

    it("should return within budget for Tavily when under limit", async () => {
      mockQuery.mockResolvedValue(
        makeQueryResult([{ tavily_calls: 50, tavily_credits: 500 }]),
      );

      const status = await costTracker.checkBudget("tavily");

      expect(status).toMatchObject({
        withinBudget: true,
        service: "tavily",
        period: "monthly",
        usage: 500,
        budget: 1000,
        percentage: 50,
      });
    });

    it("should return over budget for Tavily when exceeding limit", async () => {
      mockQuery.mockResolvedValue(
        makeQueryResult([{ tavily_calls: 250, tavily_credits: 1200 }]),
      );

      const status = await costTracker.checkBudget("tavily");

      expect(status).toMatchObject({
        withinBudget: false,
        usage: 1200,
        budget: 1000,
        percentage: 120,
      });
    });

    it("should return within budget for Anthropic when under limit", async () => {
      mockQuery.mockResolvedValue(
        makeQueryResult([
          {
            anthropic_calls: 100,
            anthropic_input_tokens: 500_000,
            anthropic_output_tokens: 250_000,
            anthropic_cost: 5.25,
          },
        ]),
      );

      const status = await costTracker.checkBudget("anthropic");

      expect(status).toMatchObject({
        withinBudget: true,
        usage: 5.25,
        budget: 10,
        percentage: 52.5,
      });
    });
  });

  describe("checkAllBudgets", () => {
    beforeEach(() => {
      process.env.TAVILY_MONTHLY_BUDGET = "1000";
      process.env.ANTHROPIC_MONTHLY_BUDGET = "10";
    });

    it("should check all service budgets", async () => {
      mockQuery
        .mockResolvedValueOnce(
          makeQueryResult([{ tavily_calls: 50, tavily_credits: 500 }]),
        )
        .mockResolvedValueOnce(makeQueryResult([{ anthropic_cost: 5.25 }]));

      const statuses = await costTracker.checkAllBudgets();

      expect(statuses).toHaveLength(2);
      expect(statuses[0]!.service).toBe("tavily");
      expect(statuses[1]!.service).toBe("anthropic");
    });
  });

  describe("getAllUsageStats", () => {
    it("should get all stats for all services and periods", async () => {
      mockQuery.mockResolvedValue(makeQueryResult([]));

      const stats = await costTracker.getAllUsageStats();

      // 2 services x 3 periods = 6 total
      expect(stats).toHaveLength(6);

      const combinations = stats.map((s) => `${s.service}-${s.period}`);
      expect(combinations).toContain("tavily-daily");
      expect(combinations).toContain("tavily-weekly");
      expect(combinations).toContain("tavily-monthly");
      expect(combinations).toContain("anthropic-daily");
      expect(combinations).toContain("anthropic-weekly");
      expect(combinations).toContain("anthropic-monthly");
    });
  });
});
