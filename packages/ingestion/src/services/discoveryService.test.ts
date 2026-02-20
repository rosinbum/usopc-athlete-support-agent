import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiscoveryService } from "./discoveryService.js";

// Create mock functions
const mockMap = vi.fn();
const mockSearch = vi.fn();

// Mock @tavily/core
vi.mock("@tavily/core", () => ({
  tavily: vi.fn(() => ({
    map: mockMap,
    search: mockSearch,
  })),
}));

// Mock @usopc/shared
vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    CircuitBreaker: vi.fn(() => ({
      execute: vi.fn((fn: () => unknown) => fn()),
      getMetrics: vi.fn(() => ({
        state: "closed",
        failures: 0,
        consecutiveFailures: 0,
        totalRequests: 0,
        totalFailures: 0,
        totalTimeouts: 0,
        totalRejections: 0,
        lastFailureTime: null,
      })),
    })),
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

describe("DiscoveryService", () => {
  let service: DiscoveryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DiscoveryService({ apiKey: "test-key" });
  });

  describe("discoverFromMap", () => {
    it("should discover URLs from a domain", async () => {
      mockMap.mockResolvedValue({
        results: ["https://usopc.org/governance", "https://usopc.org/bylaws"],
      });

      const results = await service.discoverFromMap("usopc.org", 20);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        url: "https://usopc.org/governance",
        title: "governance",
        method: "map",
        discoveredFrom: "usopc.org",
      });
      expect(mockMap).toHaveBeenCalledWith("https://usopc.org", {
        limit: 20,
      });
    });

    it("should normalize URLs and remove duplicates", async () => {
      mockMap.mockResolvedValue({
        results: [
          "https://www.usopc.org/governance/",
          "https://usopc.org/governance",
          "https://usopc.org/bylaws#section1",
          "https://usopc.org/bylaws",
        ],
      });

      const results = await service.discoverFromMap("usopc.org");

      // Should deduplicate to 2 unique URLs
      expect(results).toHaveLength(2);
      expect(results[0]!.url).toBe("https://usopc.org/governance");
      expect(results[1]!.url).toBe("https://usopc.org/bylaws");
    });

    it("should extract title from URL", async () => {
      mockMap.mockResolvedValue({
        results: ["https://usopc.org/athlete-safety-policy.pdf"],
      });

      const results = await service.discoverFromMap("usopc.org");

      expect(results[0]!.title).toBe("athlete safety policy");
    });

    it("should handle map API errors", async () => {
      mockMap.mockRejectedValue(new Error("API error"));

      await expect(service.discoverFromMap("usopc.org")).rejects.toThrow(
        "API error",
      );
    });
  });

  describe("discoverFromSearch", () => {
    it("should discover URLs from a search query", async () => {
      mockSearch.mockResolvedValue({
        results: [
          {
            url: "https://usopc.org/team-selection",
            title: "Team Selection Procedures",
          },
          {
            url: "https://usaswimming.org/selection",
            title: "USA Swimming Selection",
          },
        ],
      });

      const results = await service.discoverFromSearch(
        "team selection procedures",
        10,
        ["usopc.org", "usaswimming.org"],
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        url: "https://usopc.org/team-selection",
        title: "Team Selection Procedures",
        method: "search",
        discoveredFrom: "team selection procedures",
      });
      expect(mockSearch).toHaveBeenCalledWith("team selection procedures", {
        maxResults: 10,
        includeDomains: ["usopc.org", "usaswimming.org"],
      });
    });

    it("should work without domain filtering", async () => {
      mockSearch.mockResolvedValue({
        results: [
          {
            url: "https://usopc.org/grievance",
            title: "Grievance Policy",
          },
        ],
      });

      const results = await service.discoverFromSearch("grievance policy");

      expect(results).toHaveLength(1);
      expect(mockSearch).toHaveBeenCalledWith("grievance policy", {
        maxResults: 10,
        includeDomains: undefined,
      });
    });

    it("should handle search API errors", async () => {
      mockSearch.mockRejectedValue(new Error("Search failed"));

      await expect(service.discoverFromSearch("test query")).rejects.toThrow(
        "Search failed",
      );
    });
  });

  describe("generateId", () => {
    it("should generate consistent IDs for the same URL", () => {
      const id1 = service.generateId("https://usopc.org/governance");
      const id2 = service.generateId("https://usopc.org/governance");

      expect(id1).toBe(id2);
      expect(id1).toHaveLength(64); // SHA-256 hex length
    });

    it("should generate same ID for normalized variations", () => {
      const id1 = service.generateId("https://www.usopc.org/governance/");
      const id2 = service.generateId("https://usopc.org/governance");
      const id3 = service.generateId("https://usopc.org/governance#section");

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it("should generate different IDs for different URLs", () => {
      const id1 = service.generateId("https://usopc.org/governance");
      const id2 = service.generateId("https://usopc.org/bylaws");

      expect(id1).not.toBe(id2);
    });
  });

  describe("getCircuitBreakerMetrics", () => {
    it("should return circuit breaker metrics", () => {
      const metrics = service.getCircuitBreakerMetrics();

      expect(metrics).toHaveProperty("state");
      expect(metrics).toHaveProperty("failures");
      expect(metrics.state).toBe("closed");
    });
  });
});
