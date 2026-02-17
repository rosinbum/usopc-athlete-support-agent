import { describe, it, expect, beforeEach, vi } from "vitest";
import { handler } from "./discovery.js";
import type { EventBridgeEvent } from "aws-lambda";

// Mock dependencies
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("../discoveryOrchestrator.js", () => ({
  createDiscoveryOrchestrator: vi.fn(),
}));

vi.mock("../services/costTracker.js", () => ({
  createCostTracker: vi.fn(),
}));

vi.mock("../services/notificationService.js", () => ({
  createNotificationService: vi.fn(),
}));

describe("Discovery Lambda", () => {
  let mockOrchestrator: {
    discoverFromDomains: ReturnType<typeof vi.fn>;
    discoverFromSearchQueries: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
  };

  let mockCostTracker: {
    checkAllBudgets: ReturnType<typeof vi.fn>;
    trackTavilyCall: ReturnType<typeof vi.fn>;
    trackAnthropicCall: ReturnType<typeof vi.fn>;
    getUsageStats: ReturnType<typeof vi.fn>;
  };

  let mockNotificationService: {
    sendBudgetAlert: ReturnType<typeof vi.fn>;
    sendDiscoveryCompletion: ReturnType<typeof vi.fn>;
    sendError: ReturnType<typeof vi.fn>;
  };

  const mockEvent: EventBridgeEvent<"Scheduled Event", unknown> = {
    id: "test-event-id",
    version: "0",
    account: "123456789012",
    time: "2026-02-15T02:00:00Z",
    region: "us-east-1",
    resources: [],
    source: "aws.events",
    "detail-type": "Scheduled Event",
    detail: {},
  };

  const mockConfig = {
    domains: ["teamusa.org", "usopc.org"],
    searchQueries: ["USOPC team selection procedures"],
    maxResultsPerDomain: 20,
    maxResultsPerQuery: 10,
    autoApprovalThreshold: 0.85,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock readFile to return config
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

    // Mock orchestrator
    mockOrchestrator = {
      discoverFromDomains: vi.fn(),
      discoverFromSearchQueries: vi.fn(),
      getStats: vi.fn(),
    };

    const { createDiscoveryOrchestrator } =
      await import("../discoveryOrchestrator.js");
    vi.mocked(createDiscoveryOrchestrator).mockReturnValue(
      mockOrchestrator as any,
    );

    // Mock cost tracker
    mockCostTracker = {
      checkAllBudgets: vi.fn(),
      trackTavilyCall: vi.fn(),
      trackAnthropicCall: vi.fn(),
      getUsageStats: vi.fn(),
    };

    const { createCostTracker } = await import("../services/costTracker.js");
    vi.mocked(createCostTracker).mockReturnValue(mockCostTracker as any);

    // Mock notification service
    mockNotificationService = {
      sendBudgetAlert: vi.fn(),
      sendDiscoveryCompletion: vi.fn(),
      sendError: vi.fn(),
    };

    const { createNotificationService } =
      await import("../services/notificationService.js");
    vi.mocked(createNotificationService).mockReturnValue(
      mockNotificationService as any,
    );

    // Default budget status (within budget)
    vi.mocked(mockCostTracker.checkAllBudgets).mockResolvedValue([
      {
        withinBudget: true,
        service: "tavily",
        period: "monthly",
        usage: 500,
        budget: 1000,
        percentage: 50,
      },
      {
        withinBudget: true,
        service: "anthropic",
        period: "monthly",
        usage: 5,
        budget: 10,
        percentage: 50,
      },
    ]);

    // Default stats
    vi.mocked(mockOrchestrator.getStats).mockReturnValue({
      discovered: 25,
      enqueued: 20,
      errors: 0,
      skipped: 5,
    });

    vi.mocked(mockOrchestrator.discoverFromDomains).mockResolvedValue({
      discovered: 20,
      enqueued: 16,
      errors: 0,
      skipped: 4,
    });

    vi.mocked(mockOrchestrator.discoverFromSearchQueries).mockResolvedValue({
      discovered: 5,
      enqueued: 4,
      errors: 0,
      skipped: 1,
    });

    // Default usage stats
    vi.mocked(mockCostTracker.getUsageStats).mockResolvedValue({
      service: "tavily",
      period: "daily",
      date: "2026-02-15",
      tavily: {
        calls: 3,
        estimatedCredits: 15,
      },
    });
  });

  describe("successful execution", () => {
    it("should run discovery and send completion notification", async () => {
      await handler(mockEvent);

      // Should check budgets first
      expect(mockCostTracker.checkAllBudgets).toHaveBeenCalled();

      // Should track Tavily calls (2 domains + 1 search query)
      expect(mockCostTracker.trackTavilyCall).toHaveBeenCalledWith("map");
      expect(mockCostTracker.trackTavilyCall).toHaveBeenCalledWith("search");

      // Should run domain discovery
      expect(mockOrchestrator.discoverFromDomains).toHaveBeenCalledWith(
        mockConfig.domains,
        mockConfig.maxResultsPerDomain,
      );

      // Should run search query discovery
      expect(mockOrchestrator.discoverFromSearchQueries).toHaveBeenCalledWith(
        mockConfig.searchQueries,
        mockConfig.maxResultsPerQuery,
        mockConfig.domains,
      );

      // Should send completion notification
      expect(
        mockNotificationService.sendDiscoveryCompletion,
      ).toHaveBeenCalled();
      const summary = vi.mocked(mockNotificationService.sendDiscoveryCompletion)
        .mock.calls[0][0];
      expect(summary.totalDiscovered).toBe(25);
      expect(summary.byStatus.pending).toBe(20);
    });

    it("should track Tavily costs correctly", async () => {
      await handler(mockEvent);

      // 2 map calls (2 domains)
      const mapCalls = vi
        .mocked(mockCostTracker.trackTavilyCall)
        .mock.calls.filter((call) => call[0] === "map");
      expect(mapCalls).toHaveLength(2);

      // 1 search call (1 query)
      const searchCalls = vi
        .mocked(mockCostTracker.trackTavilyCall)
        .mock.calls.filter((call) => call[0] === "search");
      expect(searchCalls).toHaveLength(1);
    });
  });

  describe("budget checks", () => {
    it("should send warning alert at 80% budget", async () => {
      vi.mocked(mockCostTracker.checkAllBudgets).mockResolvedValue([
        {
          withinBudget: true,
          service: "tavily",
          period: "monthly",
          usage: 800,
          budget: 1000,
          percentage: 80,
        },
        {
          withinBudget: true,
          service: "anthropic",
          period: "monthly",
          usage: 5,
          budget: 10,
          percentage: 50,
        },
      ]);

      await handler(mockEvent);

      expect(mockNotificationService.sendBudgetAlert).toHaveBeenCalledWith({
        service: "tavily",
        usage: 800,
        budget: 1000,
        percentage: 80,
        threshold: "warning",
      });
    });

    it("should stop execution if budget exceeded", async () => {
      vi.mocked(mockCostTracker.checkAllBudgets).mockResolvedValue([
        {
          withinBudget: false,
          service: "tavily",
          period: "monthly",
          usage: 1200,
          budget: 1000,
          percentage: 120,
        },
        {
          withinBudget: true,
          service: "anthropic",
          period: "monthly",
          usage: 5,
          budget: 10,
          percentage: 50,
        },
      ]);

      await expect(handler(mockEvent)).rejects.toThrow("Budget exceeded");

      // Should send critical alert
      expect(mockNotificationService.sendBudgetAlert).toHaveBeenCalledWith({
        service: "tavily",
        usage: 1200,
        budget: 1000,
        percentage: 120,
        threshold: "critical",
      });

      // Should send error notification
      expect(mockNotificationService.sendError).toHaveBeenCalled();

      // Should not run discovery
      expect(mockOrchestrator.discoverFromDomains).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should continue with search queries if domain discovery fails", async () => {
      vi.mocked(mockOrchestrator.discoverFromDomains).mockRejectedValue(
        new Error("Domain discovery failed"),
      );

      await handler(mockEvent);

      // Should still run search queries
      expect(mockOrchestrator.discoverFromSearchQueries).toHaveBeenCalled();

      // Should include error in summary
      const summary = vi.mocked(mockNotificationService.sendDiscoveryCompletion)
        .mock.calls[0][0];
      expect(summary.errors).toContain(
        "Domain discovery failed: Domain discovery failed",
      );
    });

    it("should continue even if search query discovery fails", async () => {
      vi.mocked(mockOrchestrator.discoverFromSearchQueries).mockRejectedValue(
        new Error("Search failed"),
      );

      await handler(mockEvent);

      // Should still send completion notification
      expect(
        mockNotificationService.sendDiscoveryCompletion,
      ).toHaveBeenCalled();

      // Should include error in summary
      const summary = vi.mocked(mockNotificationService.sendDiscoveryCompletion)
        .mock.calls[0][0];
      expect(summary.errors).toContain(
        "Search query discovery failed: Search failed",
      );
    });

    it("should send error notification if Lambda fails", async () => {
      // Trigger a fatal error in the outer try block (e.g. cost tracking fails)
      vi.mocked(mockCostTracker.getUsageStats).mockRejectedValue(
        new Error("Fatal error"),
      );

      await expect(handler(mockEvent)).rejects.toThrow("Fatal error");

      expect(mockNotificationService.sendError).toHaveBeenCalled();
    });
  });

  describe("configuration loading", () => {
    it("should load config from custom path if set", async () => {
      process.env.DISCOVERY_CONFIG_PATH = "/custom/path/config.json";

      const { readFile } = await import("node:fs/promises");

      await handler(mockEvent);

      expect(readFile).toHaveBeenCalledWith(
        "/custom/path/config.json",
        "utf-8",
      );

      delete process.env.DISCOVERY_CONFIG_PATH;
    });

    it("should use default path if not set", async () => {
      const { readFile } = await import("node:fs/promises");

      await handler(mockEvent);

      expect(readFile).toHaveBeenCalled();
      const callPath = vi.mocked(readFile).mock.calls[0][0] as string;
      expect(callPath).toContain("discovery-config.json");
    });
  });
});
