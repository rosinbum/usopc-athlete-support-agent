import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  NotificationService,
  type BudgetAlert,
  type DiscoveryCompletionSummary,
  type RuntimeAlert,
} from "./notificationService.js";

const mockResendSend = vi.fn().mockResolvedValue({ data: { id: "test-id" } });
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: { send: mockResendSend },
  })),
}));

describe("NotificationService", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.NOTIFICATION_EMAIL;
    process.env.RESEND_API_KEY = "re_test_key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  describe("initialization", () => {
    it("has no external channels by default", () => {
      const service = new NotificationService();
      expect(service.hasExternalChannels()).toBe(false);
    });

    it("initializes with Slack when webhook URL provided", () => {
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      expect(service.hasExternalChannels()).toBe(true);
    });

    it("initializes with email when address provided", () => {
      const service = new NotificationService({ email: "admin@test.com" });
      expect(service.hasExternalChannels()).toBe(true);
    });

    it("reads environment variables when no channels provided", () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
      process.env.NOTIFICATION_EMAIL = "admin@test.com";
      const service = new NotificationService();
      expect(service.hasExternalChannels()).toBe(true);
    });

    it("disables email when RESEND_API_KEY is missing", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      delete process.env.RESEND_API_KEY;
      const service = new NotificationService({ email: "admin@test.com" });
      await service.sendError("test", "boom");
      expect(mockResendSend).not.toHaveBeenCalled();
    });
  });

  describe("sendDiscoveryCompletion", () => {
    const summary: DiscoveryCompletionSummary = {
      totalDiscovered: 25,
      byMethod: { map: 20, search: 5 },
      byStatus: { approved: 15, rejected: 5, pending: 5 },
      costSummary: { tavilyCredits: 105, anthropicCost: 2.75 },
      duration: 45000,
      errors: [],
    };

    it("makes no external calls when no channels configured", async () => {
      const service = new NotificationService();
      await service.sendDiscoveryCompletion(summary);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("sends to Slack when configured", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendDiscoveryCompletion(summary);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/test",
        expect.objectContaining({ method: "POST" }),
      );
      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.text).toContain("Source Discovery Run Complete");
      expect(body.text).toContain("Total Discovered: 25");
    });

    it("sends email when configured", async () => {
      const service = new NotificationService({ email: "admin@test.com" });
      await service.sendDiscoveryCompletion(summary);
      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: ["admin@test.com"] }),
      );
    });

    it("swallows Slack errors so the caller doesn't see them", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "err",
      });
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await expect(
        service.sendDiscoveryCompletion(summary),
      ).resolves.toBeUndefined();
    });

    it("includes errors list in body", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const withErrors: DiscoveryCompletionSummary = {
        ...summary,
        errors: ["one", "two"],
      };
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendDiscoveryCompletion(withErrors);
      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.text).toContain("Errors:");
      expect(body.text).toContain("one");
      expect(body.text).toContain("two");
    });
  });

  describe("sendBudgetAlert", () => {
    const warning: BudgetAlert = {
      service: "tavily",
      usage: 800,
      budget: 1000,
      percentage: 80,
      threshold: "warning",
    };
    const critical: BudgetAlert = {
      service: "anthropic",
      usage: 12.5,
      budget: 10,
      percentage: 125,
      threshold: "critical",
    };

    it("formats a tavily warning alert", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendBudgetAlert(warning);
      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.text).toContain("Budget Warning");
      expect(body.text).toContain("800 credits");
      expect(body.text).toContain("80.0%");
    });

    it("formats an anthropic critical alert with dollars", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendBudgetAlert(critical);
      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.text).toContain("Budget CRITICAL");
      expect(body.text).toContain("$12.5000");
      expect(body.text).toContain("BUDGET EXCEEDED");
    });
  });

  describe("sendError", () => {
    it("sends Slack and email with stack trace", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
        email: "admin@test.com",
      });
      await service.sendError("ctx", new Error("boom"));
      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.text).toContain("Error: ctx");
      expect(body.text).toContain("boom");
      expect(body.text).toContain("Stack:");
      expect(mockResendSend).toHaveBeenCalled();
    });

    it("handles channel failures silently", async () => {
      mockFetch.mockRejectedValue(new Error("network"));
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await expect(service.sendError("ctx", "boom")).resolves.toBeUndefined();
    });
  });

  describe("sendRuntimeAlert with throttling", () => {
    const alert: RuntimeAlert = {
      kind: "quota_exceeded",
      service: "anthropic",
      message: "Anthropic returned 429 insufficient_quota",
    };

    it("sends the first alert and suppresses duplicates within the dedup window", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      let now = 1000;
      const service = new NotificationService(
        { slack: "https://hooks.slack.com/test" },
        { dedupWindowMs: 60_000, now: () => now },
      );

      const first = await service.sendRuntimeAlert(alert);
      expect(first).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      now += 30_000;
      const second = await service.sendRuntimeAlert(alert);
      expect(second).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("sends again after the dedup window expires", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      let now = 1000;
      const service = new NotificationService(
        { slack: "https://hooks.slack.com/test" },
        { dedupWindowMs: 60_000, now: () => now },
      );

      await service.sendRuntimeAlert(alert);
      now += 61_000;
      const resent = await service.sendRuntimeAlert(alert);
      expect(resent).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("uses distinct dedup keys for different (kind, service) pairs", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const service = new NotificationService(
        { slack: "https://hooks.slack.com/test" },
        { dedupWindowMs: 60_000 },
      );

      await service.sendRuntimeAlert(alert);
      await service.sendRuntimeAlert({
        ...alert,
        service: "openai-embeddings",
      });
      await service.sendRuntimeAlert({ ...alert, kind: "circuit_opened" });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("includes metadata and stack trace in the body", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendRuntimeAlert({
        kind: "runtime_error",
        service: "web",
        message: "500 in handler",
        error: new Error("db down"),
        metadata: { path: "/chat", requestId: "abc" },
      });
      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.text).toContain("Runtime Error: web");
      expect(body.text).toContain("500 in handler");
      expect(body.text).toContain("Stack:");
      expect(body.text).toContain("db down");
      expect(body.text).toContain("requestId");
    });

    it("fires a circuit_opened subject line", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const service = new NotificationService({
        slack: "https://hooks.slack.com/test",
      });
      await service.sendRuntimeAlert({
        kind: "circuit_opened",
        service: "tavily",
        message: "Circuit breaker 'tavily' opened",
      });
      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.text).toContain("Circuit Breaker Open: tavily");
    });

    it("can be configured with dedupWindowMs=0 to disable throttling", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const service = new NotificationService(
        { slack: "https://hooks.slack.com/test" },
        { dedupWindowMs: 0 },
      );
      await service.sendRuntimeAlert(alert);
      await service.sendRuntimeAlert(alert);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("hasExternalChannels", () => {
    it("returns false when neither channel configured", () => {
      const service = new NotificationService();
      expect(service.hasExternalChannels()).toBe(false);
    });

    it("returns true when Slack or email is configured", () => {
      expect(
        new NotificationService({
          slack: "https://hooks.slack.com/test",
        }).hasExternalChannels(),
      ).toBe(true);
      expect(
        new NotificationService({ email: "a@b.c" }).hasExternalChannels(),
      ).toBe(true);
    });
  });
});
