import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @usopc/shared
const { mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@usopc/shared", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  normalizeUrl: vi.fn((url: string) => url),
  getResource: vi.fn((key: string) => {
    const resources: Record<string, unknown> = {
      DiscoveryFeedQueue: {
        url: "https://sqs.us-east-1.amazonaws.com/queue",
      },
    };
    return resources[key];
  }),
  getSecretValue: vi.fn(() => "test-tavily-key"),
  createQueueService: () => ({
    sendMessage: mockSendMessage,
    sendMessageBatch: vi.fn(),
    purge: vi.fn(),
    getStats: vi.fn(),
  }),
}));

// Mock DiscoveryService
vi.mock("./services/discoveryService.js", () => ({
  DiscoveryService: vi.fn(),
}));

// Import after mocks
import { DiscoveryOrchestrator } from "./discoveryOrchestrator.js";
import { DiscoveryService } from "./services/discoveryService.js";

describe("DiscoveryOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(DiscoveryService).mockImplementation(
      () =>
        ({
          discoverFromMap: vi.fn().mockResolvedValue([]),
          discoverFromSearch: vi.fn().mockResolvedValue([]),
          generateId: vi.fn().mockReturnValue("test-id"),
        }) as any,
    );
  });

  describe("constructor and stats", () => {
    it("should initialize with default config", () => {
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
      });

      const stats = orchestrator.getStats();
      expect(stats.discovered).toBe(0);
      expect(stats.enqueued).toBe(0);
      expect(stats.errors).toBe(0);
      expect(stats.skipped).toBe(0);
    });

    it("should reset stats", () => {
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
      });

      orchestrator.resetStats();

      const resetStats = orchestrator.getStats();
      expect(resetStats.discovered).toBe(0);
    });
  });

  describe("discoverFromDomains", () => {
    it("should handle empty discovery results", async () => {
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromDomains(["example.com"], 10);

      expect(stats.discovered).toBe(0);
      expect(stats.enqueued).toBe(0);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should enqueue discovered URLs via SQS", async () => {
      vi.mocked(DiscoveryService).mockImplementation(
        () =>
          ({
            discoverFromMap: vi.fn().mockResolvedValue([
              {
                url: "https://usopc.org/doc1",
                title: "Doc 1",
                method: "map",
              },
            ]),
            discoverFromSearch: vi.fn().mockResolvedValue([]),
            generateId: vi.fn(),
          }) as any,
      );

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromDomains(["usopc.org"], 10);

      expect(stats.discovered).toBe(1);
      expect(stats.enqueued).toBe(1);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(
        "https://sqs.us-east-1.amazonaws.com/queue",
        expect.any(String),
      );
    });

    it("should handle discovery errors gracefully", async () => {
      vi.mocked(DiscoveryService).mockImplementation(
        () =>
          ({
            discoverFromMap: vi.fn().mockRejectedValue(new Error("API error")),
            discoverFromSearch: vi.fn(),
            generateId: vi.fn(),
          }) as any,
      );

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromDomains(["example.com"], 10);

      expect(stats.errors).toBe(1);
      expect(stats.discovered).toBe(0);
    });

    it("should dedup URLs across batches", async () => {
      vi.mocked(DiscoveryService).mockImplementation(
        () =>
          ({
            discoverFromMap: vi.fn().mockResolvedValue([
              {
                url: "https://usopc.org/doc1",
                title: "Doc 1",
                method: "map",
              },
            ]),
            discoverFromSearch: vi.fn().mockResolvedValue([]),
            generateId: vi.fn(),
          }) as any,
      );

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
      });

      // Discover from two domains that return the same URL
      await orchestrator.discoverFromDomains(["usopc.org", "usopc.org"], 10);

      const stats = orchestrator.getStats();
      expect(stats.discovered).toBe(2);
      expect(stats.enqueued).toBe(1);
      expect(stats.skipped).toBe(1);
    });
  });

  describe("discoverFromSearchQueries", () => {
    it("should handle empty search results", async () => {
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromSearchQueries(
        ["test query"],
        10,
        ["example.com"],
      );

      expect(stats.discovered).toBe(0);
    });

    it("should enqueue search results", async () => {
      vi.mocked(DiscoveryService).mockImplementation(
        () =>
          ({
            discoverFromMap: vi.fn().mockResolvedValue([]),
            discoverFromSearch: vi.fn().mockResolvedValue([
              {
                url: "https://usopc.org/search-result",
                title: "Search Result",
                method: "search",
              },
            ]),
            generateId: vi.fn(),
          }) as any,
      );

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromSearchQueries(
        ["USOPC governance"],
        10,
      );

      expect(stats.discovered).toBe(1);
      expect(stats.enqueued).toBe(1);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("dry run mode", () => {
    it("should not send queue messages in dry run", async () => {
      vi.mocked(DiscoveryService).mockImplementation(
        () =>
          ({
            discoverFromMap: vi.fn().mockResolvedValue([
              {
                url: "https://usopc.org/doc1",
                title: "Doc 1",
                method: "map",
              },
            ]),
            discoverFromSearch: vi.fn().mockResolvedValue([]),
            generateId: vi.fn(),
          }) as any,
      );

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
        dryRun: true,
      });

      const stats = await orchestrator.discoverFromDomains(["usopc.org"], 10);

      expect(stats.discovered).toBe(1);
      expect(stats.enqueued).toBe(1);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe("config options", () => {
    it("should accept progress callback", async () => {
      const progressCallback = vi.fn();
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.85,
        onProgress: progressCallback,
      });

      await orchestrator.discoverFromDomains(["example.com"], 10);

      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe("Queue message format", () => {
    it("includes autoApprovalThreshold in message", async () => {
      vi.mocked(DiscoveryService).mockImplementation(
        () =>
          ({
            discoverFromMap: vi.fn().mockResolvedValue([
              {
                url: "https://usopc.org/doc1",
                title: "Doc 1",
                method: "map",
              },
            ]),
            discoverFromSearch: vi.fn().mockResolvedValue([]),
            generateId: vi.fn(),
          }) as any,
      );

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",

        autoApprovalThreshold: 0.9,
      });

      await orchestrator.discoverFromDomains(["usopc.org"], 10);

      const messageBody = mockSendMessage.mock.calls[0]![1] as string;
      const body = JSON.parse(messageBody);
      expect(body.autoApprovalThreshold).toBe(0.9);
      expect(body.urls).toHaveLength(1);
      expect(body.timestamp).toBeDefined();
    });
  });
});
