import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NotificationService } from "./notificationService.js";
import type {
  DiscoveryCompletionSummary,
  BudgetAlert,
} from "./notificationService.js";

// Mock AWS SES
vi.mock("@aws-sdk/client-ses", () => {
  const mockSend = vi.fn();
  return {
    SESClient: vi.fn(() => ({ send: mockSend })),
    SendEmailCommand: vi.fn((params) => params),
  };
});

describe("NotificationService", () => {
  let service: NotificationService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Clear environment variables
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.NOTIFICATION_EMAIL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with CloudWatch only by default", () => {
      service = new NotificationService();
      expect(service.hasExternalChannels()).toBe(false);
    });

    it("should initialize with Slack when webhook URL provided", () => {
      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      expect(service.hasExternalChannels()).toBe(true);
    });

    it("should initialize with email when address provided", () => {
      service = new NotificationService({ email: "admin@test.com" });
      expect(service.hasExternalChannels()).toBe(true);
    });

    it("should use environment variables when no channels provided", () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
      process.env.NOTIFICATION_EMAIL = "admin@test.com";

      service = new NotificationService();
      expect(service.hasExternalChannels()).toBe(true);
    });
  });

  describe("sendDiscoveryCompletion", () => {
    const mockSummary: DiscoveryCompletionSummary = {
      totalDiscovered: 25,
      byMethod: {
        map: 20,
        search: 5,
      },
      byStatus: {
        approved: 15,
        rejected: 5,
        pending: 5,
      },
      costSummary: {
        tavilyCredits: 105,
        anthropicCost: 2.75,
      },
      duration: 45000,
      errors: [],
    };

    it("should send to CloudWatch only by default", async () => {
      service = new NotificationService();
      await service.sendDiscoveryCompletion(mockSummary);

      // No external calls should be made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should send to Slack when configured", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendDiscoveryCompletion(mockSummary);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/test",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      const body = JSON.parse(
        vi.mocked(mockFetch).mock.calls[0][1]!.body as string,
      );
      expect(body.text).toContain("Source Discovery Run Complete");
      expect(body.text).toContain("Total Discovered: 25");
      expect(body.text).toContain("Tavily Credits: 105");
    });

    it("should handle Slack errors gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });

      // Should not throw
      await expect(
        service.sendDiscoveryCompletion(mockSummary),
      ).resolves.toBeUndefined();
    });

    it("should include errors in message", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const summaryWithErrors: DiscoveryCompletionSummary = {
        ...mockSummary,
        errors: ["Failed to fetch example.com", "Timeout on test.org"],
      };

      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendDiscoveryCompletion(summaryWithErrors);

      const body = JSON.parse(
        vi.mocked(mockFetch).mock.calls[0][1]!.body as string,
      );
      expect(body.text).toContain("Errors:");
      expect(body.text).toContain("Failed to fetch example.com");
      expect(body.text).toContain("Timeout on test.org");
    });

    it("should send email when configured", async () => {
      // Create service first so SESClient constructor is called
      service = new NotificationService({ email: "admin@test.com" });

      const { SESClient } = await import("@aws-sdk/client-ses");
      const mockSend = vi.mocked(SESClient).mock.results[0].value.send;
      vi.mocked(mockSend).mockResolvedValue({});

      await service.sendDiscoveryCompletion(mockSummary);

      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe("sendBudgetAlert", () => {
    const warningAlert: BudgetAlert = {
      service: "tavily",
      usage: 800,
      budget: 1000,
      percentage: 80,
      threshold: "warning",
    };

    const criticalAlert: BudgetAlert = {
      service: "anthropic",
      usage: 12.5,
      budget: 10,
      percentage: 125,
      threshold: "critical",
    };

    it("should send warning alert to Slack", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendBudgetAlert(warningAlert);

      const body = JSON.parse(
        vi.mocked(mockFetch).mock.calls[0][1]!.body as string,
      );
      expect(body.text).toContain("Budget Warning");
      expect(body.text).toContain("tavily");
      expect(body.text).toContain("800 credits");
      expect(body.text).toContain("80.0%");
    });

    it("should send critical alert to Slack", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendBudgetAlert(criticalAlert);

      const body = JSON.parse(
        vi.mocked(mockFetch).mock.calls[0][1]!.body as string,
      );
      expect(body.text).toContain("Budget CRITICAL");
      expect(body.text).toContain("anthropic");
      expect(body.text).toContain("$12.5000");
      expect(body.text).toContain("125.0%");
      expect(body.text).toContain("BUDGET EXCEEDED");
    });

    it("should format Tavily budget in credits", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendBudgetAlert(warningAlert);

      const body = JSON.parse(
        vi.mocked(mockFetch).mock.calls[0][1]!.body as string,
      );
      expect(body.text).toContain("Usage: 800 credits");
      expect(body.text).toContain("Budget: 1000 credits");
    });

    it("should format Anthropic budget in dollars", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendBudgetAlert(criticalAlert);

      const body = JSON.parse(
        vi.mocked(mockFetch).mock.calls[0][1]!.body as string,
      );
      expect(body.text).toContain("Usage: $12.5000");
      expect(body.text).toContain("Budget: $10.00");
    });
  });

  describe("sendError", () => {
    it("should send error notification with string message", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendError("discovery-lambda", "Database connection failed");

      const body = JSON.parse(
        vi.mocked(mockFetch).mock.calls[0][1]!.body as string,
      );
      expect(body.text).toContain("Error: discovery-lambda");
      expect(body.text).toContain("Database connection failed");
    });

    it("should send error notification with Error object", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const error = new Error("Something went wrong");
      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendError("discovery-lambda", error);

      const body = JSON.parse(
        vi.mocked(mockFetch).mock.calls[0][1]!.body as string,
      );
      expect(body.text).toContain("Error: discovery-lambda");
      expect(body.text).toContain("Something went wrong");
    });

    it("should include stack trace when available", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const error = new Error("Test error");
      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendError("test-context", error);

      const body = JSON.parse(
        vi.mocked(mockFetch).mock.calls[0][1]!.body as string,
      );
      expect(body.text).toContain("Stack:");
    });

    it("should handle notification failures gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });

      // Should not throw
      await expect(
        service.sendError("test-context", "Test error"),
      ).resolves.toBeUndefined();
    });
  });

  describe("hasExternalChannels", () => {
    it("should return false with only CloudWatch", () => {
      service = new NotificationService();
      expect(service.hasExternalChannels()).toBe(false);
    });

    it("should return true with Slack configured", () => {
      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      expect(service.hasExternalChannels()).toBe(true);
    });

    it("should return true with email configured", () => {
      service = new NotificationService({ email: "admin@test.com" });
      expect(service.hasExternalChannels()).toBe(true);
    });

    it("should return true with both configured", () => {
      service = new NotificationService({
        slack: "https://hooks.slack.com/test",
        email: "admin@test.com",
      });
      expect(service.hasExternalChannels()).toBe(true);
    });
  });
});
