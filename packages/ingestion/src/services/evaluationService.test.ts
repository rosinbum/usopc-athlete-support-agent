import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvaluationService } from "./evaluationService.js";

// Mock @langchain/anthropic
const mockInvoke = vi.fn();
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn(() => ({
    invoke: mockInvoke,
  })),
}));

// Mock @usopc/shared
vi.mock("@usopc/shared", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("EvaluationService", () => {
  let service: EvaluationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EvaluationService({ anthropicApiKey: "test-key" });
  });

  describe("evaluateMetadata", () => {
    it("should evaluate metadata and return parsed result", async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          isRelevant: true,
          confidence: 0.85,
          reasoning: "URL contains governance-related keywords",
          suggestedTopicDomains: ["governance", "team_selection"],
          preliminaryDocumentType: "Bylaws",
        }),
      });

      const result = await service.evaluateMetadata(
        "https://usopc.org/governance/bylaws",
        "USOPC Bylaws",
        "usopc.org",
      );

      expect(result.isRelevant).toBe(true);
      expect(result.confidence).toBe(0.85);
      expect(result.suggestedTopicDomains).toContain("governance");
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("should handle markdown-wrapped JSON", async () => {
      mockInvoke.mockResolvedValue({
        content: `\`\`\`json
{
  "isRelevant": false,
  "confidence": 0.2,
  "reasoning": "News article, not a policy document",
  "suggestedTopicDomains": [],
  "preliminaryDocumentType": "News Article"
}
\`\`\``,
      });

      const result = await service.evaluateMetadata(
        "https://example.com/news",
        "Latest News",
        "example.com",
      );

      expect(result.isRelevant).toBe(false);
      expect(result.confidence).toBe(0.2);
    });

    it("should return safe default on Zod validation failure", async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          isRelevant: true,
          confidence: 1.5, // invalid: > 1
          reasoning: "Test",
        }),
      });

      const result = await service.evaluateMetadata(
        "https://example.com",
        "Test",
        "example.com",
      );

      expect(result.isRelevant).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toBe("Failed to parse LLM response");
    });
  });

  describe("evaluateContent", () => {
    it("should evaluate content and return parsed result", async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          isHighQuality: true,
          confidence: 0.92,
          documentType: "Selection Procedures",
          topicDomains: ["team_selection", "eligibility"],
          authorityLevel: "ngb_policy_procedure",
          priority: "high",
          description: "USA Swimming Olympic Trials selection procedures",
          keyTopics: ["qualification", "Olympic Trials", "nomination"],
          ngbId: "usa-swimming",
        }),
      });

      const result = await service.evaluateContent(
        "https://usaswimming.org/selection",
        "Olympic Trials Selection",
        "Content about selection procedures...",
      );

      expect(result.isHighQuality).toBe(true);
      expect(result.confidence).toBe(0.92);
      expect(result.documentType).toBe("Selection Procedures");
      expect(result.ngbId).toBe("usa-swimming");
    });

    it("should handle null ngbId", async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          isHighQuality: true,
          confidence: 0.88,
          documentType: "USOPC Policy",
          topicDomains: ["governance"],
          authorityLevel: "usopc_governance",
          priority: "high",
          description: "USOPC-wide policy",
          keyTopics: ["governance"],
          ngbId: null,
        }),
      });

      const result = await service.evaluateContent(
        "https://usopc.org/policy",
        "USOPC Policy",
        "Content...",
      );

      expect(result.ngbId).toBeNull();
    });

    it("should return safe default on Zod validation failure", async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          isHighQuality: true,
          confidence: 0.9,
          documentType: "Test",
          authorityLevel: "invalid_level", // invalid enum value
        }),
      });

      const result = await service.evaluateContent(
        "https://example.com",
        "Test",
        "Content",
      );

      expect(result.isHighQuality).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.authorityLevel).toBe("educational_guidance");
    });
  });

  describe("calculateCombinedConfidence", () => {
    it("should calculate weighted average (30% metadata + 70% content)", () => {
      const result = service.calculateCombinedConfidence(0.8, 0.9);
      expect(result).toBeCloseTo(0.87, 2); // 0.8 * 0.3 + 0.9 * 0.7 = 0.87
    });

    it("should handle edge cases", () => {
      expect(service.calculateCombinedConfidence(0, 0)).toBe(0);
      expect(service.calculateCombinedConfidence(1, 1)).toBe(1);
      expect(service.calculateCombinedConfidence(0.5, 0.5)).toBe(0.5);
    });
  });
});
