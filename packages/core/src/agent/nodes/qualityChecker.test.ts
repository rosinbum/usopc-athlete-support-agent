import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn();

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    logger: {
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
  };
});

import { createQualityCheckerNode } from "./qualityChecker.js";
import { HumanMessage } from "@langchain/core/messages";
import { CircuitBreakerError } from "@usopc/shared";
import type { AgentState } from "../state.js";
import type { RetrievedDocument } from "../../types/index.js";

const qualityCheckerNode = createQualityCheckerNode({
  invoke: mockInvoke,
} as any);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [
      new HumanMessage("How do I file a Section 9 arbitration complaint?"),
    ],
    topicDomain: "dispute_resolution",
    detectedNgbIds: [],
    queryIntent: "procedural",
    retrievedDocuments: [makeDoc("Section 9 arbitration procedures...")],
    webSearchResults: [],
    webSearchResultUrls: [],
    retrievalConfidence: 0.8,
    citations: [],
    answer: "Here is a detailed answer about Section 9 arbitration...",
    escalation: undefined,
    disclaimerRequired: true,
    hasTimeConstraint: false,
    conversationId: undefined,
    conversationSummary: undefined,
    userSport: undefined,
    needsClarification: false,
    clarificationQuestion: undefined,
    escalationReason: undefined,
    retrievalStatus: "success",
    emotionalState: "neutral",
    emotionalSupportContext: undefined,
    qualityCheckResult: undefined,
    qualityRetryCount: 0,
    expansionAttempted: false,
    reformulatedQueries: [],
    isComplexQuery: false,
    subQueries: [],
    ...overrides,
  };
}

function makeDoc(content: string): RetrievedDocument {
  return {
    content,
    metadata: {
      documentTitle: "Test Document",
      documentType: "policy",
    },
    score: 0.85,
  };
}

function mockQualityResponse(data: Record<string, unknown>) {
  return { content: JSON.stringify(data) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("qualityCheckerNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips check when answer is falsy", async () => {
    const state = makeState({ answer: undefined });
    const result = await qualityCheckerNode(state);

    expect(result.qualityCheckResult?.passed).toBe(true);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("skips check when answer is empty string", async () => {
    const state = makeState({ answer: "" });
    const result = await qualityCheckerNode(state);

    expect(result.qualityCheckResult?.passed).toBe(true);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("skips check for known error messages", async () => {
    const errorMessages = [
      "I wasn't able to understand your question. Could you please rephrase it?",
      "I was unable to search our knowledge base for your question.",
      "I'm temporarily unable to generate a response due to high demand.",
      "I encountered an error while generating your answer.",
    ];

    for (const msg of errorMessages) {
      const state = makeState({ answer: msg });
      const result = await qualityCheckerNode(state);
      expect(result.qualityCheckResult?.passed).toBe(true);
    }
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("passes with high score and no critical issues", async () => {
    mockInvoke.mockResolvedValue(
      mockQualityResponse({
        passed: true,
        score: 0.85,
        issues: [],
        critique: "",
      }),
    );

    const state = makeState();
    const result = await qualityCheckerNode(state);

    expect(result.qualityCheckResult?.passed).toBe(true);
    expect(result.qualityCheckResult?.score).toBe(0.85);
  });

  it("fails with low score", async () => {
    mockInvoke.mockResolvedValue(
      mockQualityResponse({
        passed: false,
        score: 0.3,
        issues: [
          {
            type: "generic_response",
            description: "Answer is boilerplate",
            severity: "major",
          },
        ],
        critique: "The answer does not address the specific question.",
      }),
    );

    const state = makeState();
    const result = await qualityCheckerNode(state);

    expect(result.qualityCheckResult?.passed).toBe(false);
    expect(result.qualityCheckResult?.score).toBe(0.3);
    expect(result.qualityCheckResult?.issues).toHaveLength(1);
  });

  it("fails with critical issue even on high score", async () => {
    mockInvoke.mockResolvedValue(
      mockQualityResponse({
        passed: true,
        score: 0.8,
        issues: [
          {
            type: "hallucination_signal",
            description: "Claims not in context",
            severity: "critical",
          },
        ],
        critique: "Contains unsupported claims.",
      }),
    );

    const state = makeState();
    const result = await qualityCheckerNode(state);

    expect(result.qualityCheckResult?.passed).toBe(false);
    expect(result.qualityCheckResult?.score).toBe(0.8);
  });

  it("fails open on JSON parse error", async () => {
    mockInvoke.mockResolvedValue({ content: "not valid json {{{" });

    const state = makeState();
    const result = await qualityCheckerNode(state);

    expect(result.qualityCheckResult?.passed).toBe(true);
  });

  it("fails open on LLM invocation error", async () => {
    mockInvoke.mockRejectedValue(new Error("API timeout"));

    const state = makeState();
    const result = await qualityCheckerNode(state);

    expect(result.qualityCheckResult?.passed).toBe(true);
  });

  it("fails open on CircuitBreakerError", async () => {
    mockInvoke.mockRejectedValue(new CircuitBreakerError("anthropic"));

    const state = makeState();
    const result = await qualityCheckerNode(state);

    expect(result.qualityCheckResult?.passed).toBe(true);
  });

  it("strips markdown fences from response", async () => {
    const json = JSON.stringify({
      passed: true,
      score: 0.9,
      issues: [],
      critique: "",
    });
    mockInvoke.mockResolvedValue({ content: `\`\`\`json\n${json}\n\`\`\`` });

    const state = makeState();
    const result = await qualityCheckerNode(state);

    expect(result.qualityCheckResult?.passed).toBe(true);
    expect(result.qualityCheckResult?.score).toBe(0.9);
  });
});
