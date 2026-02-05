import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn();

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

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
    getOptionalSecretValue: vi.fn().mockReturnValue("5"),
  };
});

import { classifierNode, parseClassifierResponse } from "./classifier.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { CircuitBreakerError } from "@usopc/shared";
import type { AgentState } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("What are the team selection procedures?")],
    topicDomain: undefined,
    detectedNgbIds: [],
    queryIntent: undefined,
    retrievedDocuments: [],
    webSearchResults: [],
    retrievalConfidence: 0,
    citations: [],
    answer: undefined,
    escalation: undefined,
    disclaimerRequired: true,
    hasTimeConstraint: false,
    conversationId: undefined,
    userSport: undefined,
    needsClarification: false,
    clarificationQuestion: undefined,
    retrievalStatus: "success",
    ...overrides,
  };
}

function classifierResponse(data: Record<string, unknown>): {
  content: string;
} {
  return { content: JSON.stringify(data) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("classifierNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns general intent for empty messages", async () => {
    const state = makeState({ messages: [] });
    const result = await classifierNode(state);
    expect(result.queryIntent).toBe("general");
  });

  it("classifies a team selection question", async () => {
    mockInvoke.mockResolvedValueOnce(
      classifierResponse({
        topicDomain: "team_selection",
        detectedNgbIds: ["usa_swimming"],
        queryIntent: "procedural",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    const state = makeState();
    const result = await classifierNode(state);

    expect(result.topicDomain).toBe("team_selection");
    expect(result.detectedNgbIds).toEqual(["usa_swimming"]);
    expect(result.queryIntent).toBe("procedural");
    expect(result.hasTimeConstraint).toBe(false);
  });

  it("sets queryIntent to escalation when shouldEscalate is true", async () => {
    mockInvoke.mockResolvedValueOnce(
      classifierResponse({
        topicDomain: "safesport",
        detectedNgbIds: [],
        queryIntent: "factual",
        hasTimeConstraint: true,
        shouldEscalate: true,
        escalationReason: "User reports abuse",
      }),
    );

    const state = makeState({
      messages: [new HumanMessage("I need to report abuse by my coach")],
    });
    const result = await classifierNode(state);

    expect(result.queryIntent).toBe("escalation");
    expect(result.topicDomain).toBe("safesport");
    expect(result.hasTimeConstraint).toBe(true);
  });

  it("handles markdown code fences around JSON", async () => {
    const json = JSON.stringify({
      topicDomain: "anti_doping",
      detectedNgbIds: [],
      queryIntent: "factual",
      hasTimeConstraint: false,
      shouldEscalate: false,
    });
    mockInvoke.mockResolvedValueOnce({
      content: "```json\n" + json + "\n```",
    });

    const state = makeState({
      messages: [new HumanMessage("What substances are prohibited?")],
    });
    const result = await classifierNode(state);
    expect(result.topicDomain).toBe("anti_doping");
    expect(result.queryIntent).toBe("factual");
  });

  it("falls back to defaults when the model returns invalid JSON", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "I cannot process this request",
    });

    const state = makeState();
    const result = await classifierNode(state);

    // Falls back because JSON.parse throws
    expect(result.queryIntent).toBe("general");
    expect(result.detectedNgbIds).toEqual([]);
  });

  it("falls back to defaults when the model throws an error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("API rate limited"));

    const state = makeState();
    const result = await classifierNode(state);

    expect(result.queryIntent).toBe("general");
    expect(result.detectedNgbIds).toEqual([]);
    expect(result.hasTimeConstraint).toBe(false);
  });

  it("defaults invalid topicDomain to team_selection", async () => {
    mockInvoke.mockResolvedValueOnce(
      classifierResponse({
        topicDomain: "invalid_domain",
        detectedNgbIds: [],
        queryIntent: "general",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    const state = makeState();
    const result = await classifierNode(state);
    // parseClassifierResponse defaults invalid domain to "team_selection"
    expect(result.topicDomain).toBe("team_selection");
  });

  it("defaults invalid queryIntent to general", async () => {
    mockInvoke.mockResolvedValueOnce(
      classifierResponse({
        topicDomain: "governance",
        detectedNgbIds: [],
        queryIntent: "invalid_intent",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    const state = makeState();
    const result = await classifierNode(state);
    expect(result.queryIntent).toBe("general");
  });

  it("filters out invalid NGB IDs (non-string, empty)", async () => {
    mockInvoke.mockResolvedValueOnce(
      classifierResponse({
        topicDomain: "team_selection",
        detectedNgbIds: ["usa_swimming", "", 123, null, "usa_track_field"],
        queryIntent: "factual",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    const state = makeState();
    const result = await classifierNode(state);
    expect(result.detectedNgbIds).toEqual(["usa_swimming", "usa_track_field"]);
  });

  it("handles array content from Claude response", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            topicDomain: "eligibility",
            detectedNgbIds: [],
            queryIntent: "factual",
            hasTimeConstraint: false,
            shouldEscalate: false,
          }),
        },
      ],
    });

    const state = makeState({
      messages: [new HumanMessage("What are the age requirements?")],
    });
    const result = await classifierNode(state);
    expect(result.topicDomain).toBe("eligibility");
  });

  it("sets needsClarification when query is ambiguous", async () => {
    mockInvoke.mockResolvedValueOnce(
      classifierResponse({
        topicDomain: "team_selection",
        detectedNgbIds: [],
        queryIntent: "factual",
        hasTimeConstraint: false,
        shouldEscalate: false,
        needsClarification: true,
        clarificationQuestion: "Which sport are you asking about?",
      }),
    );

    const state = makeState({
      messages: [new HumanMessage("What are the selection criteria?")],
    });
    const result = await classifierNode(state);

    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toBe(
      "Which sport are you asking about?",
    );
  });

  it("defaults needsClarification to false when not provided", async () => {
    mockInvoke.mockResolvedValueOnce(
      classifierResponse({
        topicDomain: "team_selection",
        detectedNgbIds: ["usa_swimming"],
        queryIntent: "factual",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    const state = makeState({
      messages: [new HumanMessage("What are USA Swimming selection criteria?")],
    });
    const result = await classifierNode(state);

    expect(result.needsClarification).toBe(false);
    expect(result.clarificationQuestion).toBeUndefined();
  });

  it("returns needsClarification false on error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("API error"));

    const state = makeState();
    const result = await classifierNode(state);

    expect(result.needsClarification).toBe(false);
  });

  describe("conversation context", () => {
    it("uses conversation history to resolve follow-up questions", async () => {
      // First exchange about swimming team selection
      // Second question is a follow-up referencing prior context
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "team_selection",
          detectedNgbIds: ["usa_swimming"],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage(
            "What are the team selection criteria for swimming?",
          ),
          new AIMessage(
            "USA Swimming selects athletes based on time standards at Olympic Trials...",
          ),
          new HumanMessage("What about alternates?"),
        ],
      });

      const result = await classifierNode(state);

      // The classifier should understand "alternates" refers to swimming team selection
      expect(result.topicDomain).toBe("team_selection");
      expect(result.detectedNgbIds).toEqual(["usa_swimming"]);
    });

    it("carries forward sport context for pronoun resolution", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "dispute_resolution",
          detectedNgbIds: ["usa_swimming"],
          queryIntent: "procedural",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage("I compete in swimming."),
          new AIMessage("Great! I can help with swimming-related questions."),
          new HumanMessage("How do I appeal that decision?"),
        ],
      });

      const result = await classifierNode(state);

      // Should carry forward the swimming context
      expect(result.detectedNgbIds).toEqual(["usa_swimming"]);
    });

    it("works correctly with single message (no prior context)", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "eligibility",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: true,
          clarificationQuestion: "Which sport are you asking about?",
        }),
      );

      const state = makeState({
        messages: [new HumanMessage("What are the age requirements?")],
      });

      const result = await classifierNode(state);

      // Without context, classifier should ask for clarification
      expect(result.needsClarification).toBe(true);
      expect(result.clarificationQuestion).toBe(
        "Which sport are you asking about?",
      );
    });
  });

  describe("CircuitBreakerError handling", () => {
    it("falls back to defaults when circuit breaker is open", async () => {
      mockInvoke.mockRejectedValueOnce(new CircuitBreakerError("anthropic"));

      const state = makeState();
      const result = await classifierNode(state);

      expect(result.queryIntent).toBe("general");
      expect(result.detectedNgbIds).toEqual([]);
      expect(result.hasTimeConstraint).toBe(false);
      expect(result.needsClarification).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// parseClassifierResponse
// ---------------------------------------------------------------------------

describe("parseClassifierResponse", () => {
  it("parses valid JSON correctly", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "safesport",
        detectedNgbIds: ["usa_swimming"],
        queryIntent: "factual",
        hasTimeConstraint: true,
        shouldEscalate: false,
      }),
    );

    expect(output.topicDomain).toBe("safesport");
    expect(output.detectedNgbIds).toEqual(["usa_swimming"]);
    expect(output.queryIntent).toBe("factual");
    expect(output.hasTimeConstraint).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it("warns on invalid topicDomain and defaults to team_selection", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "made_up_domain",
        detectedNgbIds: [],
        queryIntent: "general",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    expect(output.topicDomain).toBe("team_selection");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Invalid topicDomain");
    expect(warnings[0]).toContain("made_up_domain");
  });

  it("warns on invalid queryIntent and defaults to general", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "governance",
        detectedNgbIds: [],
        queryIntent: "invalid_intent",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    expect(output.queryIntent).toBe("general");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Invalid queryIntent");
  });

  it("collects multiple warnings", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "bad_domain",
        detectedNgbIds: [],
        queryIntent: "bad_intent",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    expect(output.topicDomain).toBe("team_selection");
    expect(output.queryIntent).toBe("general");
    expect(warnings).toHaveLength(2);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseClassifierResponse("not json")).toThrow();
  });

  it("strips markdown code fences", () => {
    const json = JSON.stringify({
      topicDomain: "anti_doping",
      detectedNgbIds: [],
      queryIntent: "factual",
      hasTimeConstraint: false,
      shouldEscalate: false,
    });

    const { output, warnings } = parseClassifierResponse(
      "```json\n" + json + "\n```",
    );
    expect(output.topicDomain).toBe("anti_doping");
    expect(warnings).toHaveLength(0);
  });

  it("handles needsClarification and clarificationQuestion", () => {
    const { output } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "team_selection",
        detectedNgbIds: [],
        queryIntent: "general",
        hasTimeConstraint: false,
        shouldEscalate: false,
        needsClarification: true,
        clarificationQuestion: "Which sport?",
      }),
    );

    expect(output.needsClarification).toBe(true);
    expect(output.clarificationQuestion).toBe("Which sport?");
  });
});
