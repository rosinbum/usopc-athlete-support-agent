import { describe, it, expect, beforeEach, vi } from "vitest";
import { CostTracker } from "./costTracker.js";
import { createAppTable } from "@usopc/shared";

describe("CostTracker", () => {
  let costTracker: CostTracker;
  let mockModel: {
    update: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let mockTable: ReturnType<typeof createAppTable>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the model methods
    mockModel = {
      update: vi.fn(),
      get: vi.fn(),
    };

    // Mock table with getModel
    mockTable = {
      getModel: vi.fn(() => mockModel),
    } as unknown as ReturnType<typeof createAppTable>;

    costTracker = new CostTracker(mockTable);
  });

  describe("trackTavilyCall", () => {
    it("should track a search call with 1 credit", async () => {
      await costTracker.trackTavilyCall("search");

      // Should update all three periods (daily, weekly, monthly)
      expect(mockModel.update).toHaveBeenCalledTimes(3);

      // Check that the first call has the correct increments
      const firstCall = vi.mocked(mockModel.update).mock.calls[0];
      expect(firstCall[1]).toEqual({
        add: {
          tavilyCalls: 1,
          tavilyCredits: 1,
        },
        exists: null,
      });
    });

    it("should track a map call with 5 credits", async () => {
      await costTracker.trackTavilyCall("map");

      expect(mockModel.update).toHaveBeenCalledTimes(3);

      const firstCall = vi.mocked(mockModel.update).mock.calls[0];
      expect(firstCall[1]).toEqual({
        add: {
          tavilyCalls: 1,
          tavilyCredits: 5,
        },
        exists: null,
      });
    });

    it("should handle update errors", async () => {
      vi.mocked(mockModel.update).mockRejectedValue(
        new Error("DynamoDB error"),
      );

      await expect(costTracker.trackTavilyCall("search")).rejects.toThrow(
        "DynamoDB error",
      );
    });
  });

  describe("trackAnthropicCall", () => {
    it("should track call with token usage and cost", async () => {
      // 1M input tokens = $3, 1M output tokens = $15
      // 100k input = $0.30, 50k output = $0.75, total = $1.05
      await costTracker.trackAnthropicCall(100_000, 50_000);

      expect(mockModel.update).toHaveBeenCalledTimes(3);

      const firstCall = vi.mocked(mockModel.update).mock.calls[0];
      expect(firstCall[1].add).toMatchObject({
        anthropicCalls: 1,
        anthropicInputTokens: 100_000,
        anthropicOutputTokens: 50_000,
      });

      // Check cost calculation (should be $1.05)
      const cost = firstCall[1].add.anthropicCost;
      expect(cost).toBeCloseTo(1.05, 2);
    });

    it("should handle zero tokens", async () => {
      await costTracker.trackAnthropicCall(0, 0);

      const firstCall = vi.mocked(mockModel.update).mock.calls[0];
      expect(firstCall[1].add.anthropicCost).toBe(0);
    });

    it("should handle update errors", async () => {
      vi.mocked(mockModel.update).mockRejectedValue(
        new Error("DynamoDB error"),
      );

      await expect(costTracker.trackAnthropicCall(1000, 500)).rejects.toThrow(
        "DynamoDB error",
      );
    });
  });

  describe("getUsageStats", () => {
    it("should return Tavily stats for monthly period", async () => {
      vi.mocked(mockModel.get).mockResolvedValue({
        service: "tavily",
        period: "monthly",
        date: "2026-02-01",
        tavilyCalls: 10,
        tavilyCredits: 25,
      });

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
      vi.mocked(mockModel.get).mockResolvedValue({
        service: "anthropic",
        period: "daily",
        date: "2026-02-15",
        anthropicCalls: 5,
        anthropicInputTokens: 100_000,
        anthropicOutputTokens: 50_000,
        anthropicCost: 1.05,
      });

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
      vi.mocked(mockModel.get).mockResolvedValue(null);

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

    it("should handle get errors", async () => {
      vi.mocked(mockModel.get).mockRejectedValue(new Error("DynamoDB error"));

      await expect(
        costTracker.getUsageStats("tavily", "monthly"),
      ).rejects.toThrow("DynamoDB error");
    });
  });

  describe("checkBudget", () => {
    beforeEach(() => {
      // Set default budgets
      process.env.TAVILY_MONTHLY_BUDGET = "1000";
      process.env.ANTHROPIC_MONTHLY_BUDGET = "10";
    });

    it("should return within budget for Tavily when under limit", async () => {
      vi.mocked(mockModel.get).mockResolvedValue({
        service: "tavily",
        period: "monthly",
        date: "2026-02-01",
        tavilyCalls: 50,
        tavilyCredits: 500, // 50% of 1000
      });

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
      vi.mocked(mockModel.get).mockResolvedValue({
        service: "tavily",
        period: "monthly",
        date: "2026-02-01",
        tavilyCalls: 250,
        tavilyCredits: 1200, // 120% of 1000
      });

      const status = await costTracker.checkBudget("tavily");

      expect(status).toMatchObject({
        withinBudget: false,
        service: "tavily",
        period: "monthly",
        usage: 1200,
        budget: 1000,
        percentage: 120,
      });
    });

    it("should return within budget for Anthropic when under limit", async () => {
      vi.mocked(mockModel.get).mockResolvedValue({
        service: "anthropic",
        period: "monthly",
        date: "2026-02-01",
        anthropicCalls: 100,
        anthropicInputTokens: 500_000,
        anthropicOutputTokens: 250_000,
        anthropicCost: 5.25, // 52.5% of $10
      });

      const status = await costTracker.checkBudget("anthropic");

      expect(status).toMatchObject({
        withinBudget: true,
        service: "anthropic",
        period: "monthly",
        usage: 5.25,
        budget: 10,
        percentage: 52.5,
      });
    });

    it("should return over budget for Anthropic when exceeding limit", async () => {
      vi.mocked(mockModel.get).mockResolvedValue({
        service: "anthropic",
        period: "monthly",
        date: "2026-02-01",
        anthropicCalls: 200,
        anthropicInputTokens: 1_500_000,
        anthropicOutputTokens: 750_000,
        anthropicCost: 15.75, // 157.5% of $10
      });

      const status = await costTracker.checkBudget("anthropic");

      expect(status).toMatchObject({
        withinBudget: false,
        service: "anthropic",
        period: "monthly",
        usage: 15.75,
        budget: 10,
        percentage: 157.5,
      });
    });

    it("should use custom budget from environment variables", async () => {
      process.env.TAVILY_MONTHLY_BUDGET = "500";

      vi.mocked(mockModel.get).mockResolvedValue({
        service: "tavily",
        period: "monthly",
        date: "2026-02-01",
        tavilyCalls: 100,
        tavilyCredits: 400,
      });

      const status = await costTracker.checkBudget("tavily");

      expect(status.budget).toBe(500);
      expect(status.percentage).toBe(80);
    });

    it("should handle zero budget gracefully", async () => {
      process.env.TAVILY_MONTHLY_BUDGET = "0";

      vi.mocked(mockModel.get).mockResolvedValue({
        service: "tavily",
        period: "monthly",
        date: "2026-02-01",
        tavilyCalls: 10,
        tavilyCredits: 50,
      });

      const status = await costTracker.checkBudget("tavily");

      expect(status.budget).toBe(0);
      expect(status.percentage).toBe(0);
      expect(status.withinBudget).toBe(false);
    });
  });

  describe("checkAllBudgets", () => {
    beforeEach(() => {
      process.env.TAVILY_MONTHLY_BUDGET = "1000";
      process.env.ANTHROPIC_MONTHLY_BUDGET = "10";
    });

    it("should check all service budgets", async () => {
      vi.mocked(mockModel.get)
        .mockResolvedValueOnce({
          service: "tavily",
          period: "monthly",
          date: "2026-02-01",
          tavilyCalls: 50,
          tavilyCredits: 500,
        })
        .mockResolvedValueOnce({
          service: "anthropic",
          period: "monthly",
          date: "2026-02-01",
          anthropicCalls: 100,
          anthropicInputTokens: 500_000,
          anthropicOutputTokens: 250_000,
          anthropicCost: 5.25,
        });

      const statuses = await costTracker.checkAllBudgets();

      expect(statuses).toHaveLength(2);
      expect(statuses[0].service).toBe("tavily");
      expect(statuses[0].withinBudget).toBe(true);
      expect(statuses[1].service).toBe("anthropic");
      expect(statuses[1].withinBudget).toBe(true);
    });

    it("should identify budget overruns", async () => {
      vi.mocked(mockModel.get)
        .mockResolvedValueOnce({
          service: "tavily",
          period: "monthly",
          date: "2026-02-01",
          tavilyCalls: 250,
          tavilyCredits: 1200,
        })
        .mockResolvedValueOnce({
          service: "anthropic",
          period: "monthly",
          date: "2026-02-01",
          anthropicCalls: 200,
          anthropicInputTokens: 1_500_000,
          anthropicOutputTokens: 750_000,
          anthropicCost: 15.75,
        });

      const statuses = await costTracker.checkAllBudgets();

      expect(statuses).toHaveLength(2);
      expect(statuses[0].withinBudget).toBe(false);
      expect(statuses[1].withinBudget).toBe(false);
    });
  });

  describe("getAllUsageStats", () => {
    it("should get all stats for all services and periods", async () => {
      vi.mocked(mockModel.get).mockResolvedValue({
        tavilyCalls: 10,
        tavilyCredits: 25,
        anthropicCalls: 5,
        anthropicInputTokens: 100_000,
        anthropicOutputTokens: 50_000,
        anthropicCost: 1.05,
      });

      const stats = await costTracker.getAllUsageStats();

      // 2 services × 3 periods = 6 total
      expect(stats).toHaveLength(6);

      // Check that we have all combinations
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
