import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @usopc/shared
vi.mock("@usopc/shared", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  createAppTable: vi.fn(() => ({})),
  DiscoveredSourceEntity: vi.fn(),
}));

// Mock SST Resource
vi.mock("sst", () => ({
  Resource: {
    AppTable: { name: "test-table" },
    TavilyApiKey: { value: "test-tavily-key" },
    AnthropicApiKey: { value: "test-anthropic-key" },
  },
}));

// Mock DiscoveryService
vi.mock("./services/discoveryService.js", () => ({
  DiscoveryService: vi.fn(),
}));

// Mock EvaluationService
vi.mock("./services/evaluationService.js", () => ({
  EvaluationService: vi.fn(),
}));

// Mock loadWeb
vi.mock("./loaders/index.js", () => ({
  loadWeb: vi.fn(),
}));

// Import after mocks
import { DiscoveryOrchestrator } from "./discoveryOrchestrator.js";
import { DiscoveredSourceEntity } from "@usopc/shared";
import { DiscoveryService } from "./services/discoveryService.js";
import { EvaluationService } from "./services/evaluationService.js";
import { loadWeb } from "./loaders/index.js";

describe("DiscoveryOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock implementations
    vi.mocked(DiscoveredSourceEntity).mockImplementation(
      () =>
        ({
          create: vi.fn(),
          getById: vi.fn().mockResolvedValue(null),
          markMetadataEvaluated: vi.fn(),
          markContentEvaluated: vi.fn(),
        }) as any,
    );

    vi.mocked(DiscoveryService).mockImplementation(
      () =>
        ({
          discoverFromMap: vi.fn().mockResolvedValue([]),
          discoverFromSearch: vi.fn().mockResolvedValue([]),
          generateId: vi.fn().mockReturnValue("test-id"),
        }) as any,
    );

    vi.mocked(EvaluationService).mockImplementation(
      () =>
        ({
          evaluateMetadata: vi.fn(),
          evaluateContent: vi.fn(),
          calculateCombinedConfidence: vi.fn(),
        }) as any,
    );

    vi.mocked(loadWeb).mockResolvedValue([
      { pageContent: "Test content", metadata: {} } as any,
    ]);
  });

  describe("constructor and stats", () => {
    it("should initialize with default config", () => {
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        anthropicApiKey: "test-key",
        autoApprovalThreshold: 0.85,
      });

      const stats = orchestrator.getStats();
      expect(stats.discovered).toBe(0);
      expect(stats.evaluated).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.errors).toBe(0);
      expect(stats.skipped).toBe(0);
    });

    it("should reset stats", () => {
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        anthropicApiKey: "test-key",
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
        anthropicApiKey: "test-key",
        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromDomains(["example.com"], 10);

      expect(stats.discovered).toBe(0);
      expect(stats.evaluated).toBe(0);
    });

    it("should handle discovery errors gracefully", async () => {
      const mockError = new Error("API error");
      const DiscoveryServiceMock = vi.mocked(DiscoveryService);
      DiscoveryServiceMock.mockImplementation(
        () =>
          ({
            discoverFromMap: vi.fn().mockRejectedValue(mockError),
            discoverFromSearch: vi.fn(),
            generateId: vi.fn(),
          }) as any,
      );

      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        anthropicApiKey: "test-key",
        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromDomains(["example.com"], 10);

      expect(stats.errors).toBe(1);
      expect(stats.discovered).toBe(0);
    });
  });

  describe("discoverFromSearchQueries", () => {
    it("should handle empty search results", async () => {
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        anthropicApiKey: "test-key",
        autoApprovalThreshold: 0.85,
      });

      const stats = await orchestrator.discoverFromSearchQueries(
        ["test query"],
        10,
        ["example.com"],
      );

      expect(stats.discovered).toBe(0);
    });
  });

  describe("config options", () => {
    it("should accept custom concurrency", () => {
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        anthropicApiKey: "test-key",
        autoApprovalThreshold: 0.85,
        concurrency: 5,
      });

      expect(orchestrator).toBeDefined();
    });

    it("should accept dry run mode", () => {
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        anthropicApiKey: "test-key",
        autoApprovalThreshold: 0.85,
        dryRun: true,
      });

      expect(orchestrator).toBeDefined();
    });

    it("should accept progress callback", () => {
      const progressCallback = vi.fn();
      const orchestrator = new DiscoveryOrchestrator({
        tavilyApiKey: "test-key",
        anthropicApiKey: "test-key",
        autoApprovalThreshold: 0.85,
        onProgress: progressCallback,
      });

      expect(orchestrator).toBeDefined();
    });
  });
});
