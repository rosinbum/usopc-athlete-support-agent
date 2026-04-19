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
import {
  DiscoveryOrchestrator,
  DISCOVERY_FEED_CHUNK_SIZE,
} from "./discoveryOrchestrator.js";
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

  describe("Chunking", () => {
    function makeUrls(count: number) {
      return Array.from({ length: count }, (_, i) => ({
        url: `https://usopc.org/doc-${i}`,
        title: `Doc ${i}`,
        method: "map" as const,
      }));
    }

    it("publishes a single message when URL count is at or below the chunk size", async () => {
      vi.mocked(DiscoveryService).mockImplementation(
        () =>
          ({
            discoverFromMap: vi
              .fn()
              .mockResolvedValue(makeUrls(DISCOVERY_FEED_CHUNK_SIZE)),
            discoverFromSearch: vi.fn().mockResolvedValue([]),
            generateId: vi.fn(),
          }) as any,
      );

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromDomains(["usopc.org"], 100);

      expect(stats.enqueued).toBe(DISCOVERY_FEED_CHUNK_SIZE);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockSendMessage.mock.calls[0]![1] as string);
      expect(body.urls).toHaveLength(DISCOVERY_FEED_CHUNK_SIZE);
    });

    it("splits URLs into chunks when above the chunk size", async () => {
      const total = DISCOVERY_FEED_CHUNK_SIZE * 3 + 2; // 47 URLs for chunk size 15
      vi.mocked(DiscoveryService).mockImplementation(
        () =>
          ({
            discoverFromMap: vi.fn().mockResolvedValue(makeUrls(total)),
            discoverFromSearch: vi.fn().mockResolvedValue([]),
            generateId: vi.fn(),
          }) as any,
      );

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromDomains(["usopc.org"], 100);

      const expectedChunks = Math.ceil(total / DISCOVERY_FEED_CHUNK_SIZE);
      expect(mockSendMessage).toHaveBeenCalledTimes(expectedChunks);
      expect(stats.enqueued).toBe(total);

      const sentCalls = mockSendMessage.mock.calls;
      // Every chunk respects the chunk size ceiling
      for (const call of sentCalls) {
        const body = JSON.parse(call[1] as string);
        expect(body.urls.length).toBeLessThanOrEqual(DISCOVERY_FEED_CHUNK_SIZE);
        expect(body.urls.length).toBeGreaterThan(0);
      }
      // Last chunk holds the remainder
      const lastBody = JSON.parse(
        sentCalls[sentCalls.length - 1]![1] as string,
      );
      expect(lastBody.urls).toHaveLength(total % DISCOVERY_FEED_CHUNK_SIZE);

      // URLs are partitioned, not duplicated
      const flattened = sentCalls.flatMap(
        (c) => JSON.parse(c[1] as string).urls as Array<{ url: string }>,
      );
      expect(flattened).toHaveLength(total);
      expect(new Set(flattened.map((u) => u.url)).size).toBe(total);
    });

    it("continues publishing remaining chunks when one send fails", async () => {
      const total = DISCOVERY_FEED_CHUNK_SIZE * 2;
      vi.mocked(DiscoveryService).mockImplementation(
        () =>
          ({
            discoverFromMap: vi.fn().mockResolvedValue(makeUrls(total)),
            discoverFromSearch: vi.fn().mockResolvedValue([]),
            generateId: vi.fn(),
          }) as any,
      );

      mockSendMessage
        .mockRejectedValueOnce(new Error("Pub/Sub unavailable"))
        .mockResolvedValueOnce(undefined);

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromDomains(["usopc.org"], 100);

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(stats.enqueued).toBe(DISCOVERY_FEED_CHUNK_SIZE);
      expect(stats.errors).toBe(1);
    });
  });
});
