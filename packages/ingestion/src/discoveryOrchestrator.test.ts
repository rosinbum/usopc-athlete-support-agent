import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @usopc/shared
vi.mock("@usopc/shared", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock SST Resource
vi.mock("sst", () => ({
  Resource: {
    TavilyApiKey: { value: "test-tavily-key" },
    DiscoveryFeedQueue: { url: "https://sqs.us-east-1.amazonaws.com/queue" },
  },
}));

// Mock @usopc/core
vi.mock("@usopc/core", () => ({
  normalizeUrl: vi.fn((url: string) => url),
}));

// Mock SQS
const { mockSqsSend } = vi.hoisted(() => ({
  mockSqsSend: vi.fn().mockResolvedValue({}),
}));
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn(() => ({ send: mockSqsSend })),
  SendMessageCommand: vi.fn(),
}));

// Mock DiscoveryService
vi.mock("./services/discoveryService.js", () => ({
  DiscoveryService: vi.fn(),
}));

// Import after mocks
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { DiscoveryOrchestrator } from "./discoveryOrchestrator.js";
import { DiscoveryService } from "./services/discoveryService.js";

const MockSendMessageCommand = vi.mocked(SendMessageCommand);

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
      expect(mockSqsSend).not.toHaveBeenCalled();
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
      expect(mockSqsSend).toHaveBeenCalledTimes(1);
      expect(MockSendMessageCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          QueueUrl: "https://sqs.us-east-1.amazonaws.com/queue",
        }),
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
      expect(mockSqsSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("dry run mode", () => {
    it("should not send SQS messages in dry run", async () => {
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
      expect(mockSqsSend).not.toHaveBeenCalled();
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

  describe("SQS message format", () => {
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

      const commandArg = MockSendMessageCommand.mock.calls[0][0];
      const body = JSON.parse(commandArg.MessageBody!);
      expect(body.autoApprovalThreshold).toBe(0.9);
      expect(body.urls).toHaveLength(1);
      expect(body.timestamp).toBeDefined();
    });
  });
});
