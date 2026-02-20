import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

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

import { createClassifierNode, parseClassifierResponse } from "./classifier.js";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { CircuitBreakerError } from "@usopc/shared";
import type { AgentState } from "../state.js";

const classifierNode = createClassifierNode(new ChatAnthropic());

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
    webSearchResultUrls: [],
    retrievalConfidence: 0,
    citations: [],
    answer: undefined,
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

  it("passes escalationReason to state when shouldEscalate is true", async () => {
    mockInvoke.mockResolvedValueOnce(
      classifierResponse({
        topicDomain: "safesport",
        detectedNgbIds: [],
        queryIntent: "factual",
        hasTimeConstraint: false,
        shouldEscalate: true,
        escalationReason: "Athlete reports pattern of emotional misconduct",
      }),
    );

    const state = makeState({
      messages: [
        new HumanMessage("My coach has been verbally abusive for months"),
      ],
    });
    const result = await classifierNode(state);

    expect(result.escalationReason).toBe(
      "Athlete reports pattern of emotional misconduct",
    );
  });

  it("sets escalationReason to undefined when shouldEscalate is false", async () => {
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

    expect(result.escalationReason).toBeUndefined();
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

  it("leaves topicDomain undefined when classifier returns an invalid domain", async () => {
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
    // parseClassifierResponse leaves topicDomain undefined for invalid domains
    // so retrieval falls back to broader (unfiltered) search instead of biasing
    // toward team_selection documents.
    expect(result.topicDomain).toBeUndefined();
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
        clarificationQuestion:
          "That's a great question — which sport is this about?",
      }),
    );

    const state = makeState({
      messages: [new HumanMessage("What are the selection criteria?")],
    });
    const result = await classifierNode(state);

    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toBe(
      "That's a great question — which sport is this about?",
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

  it("does not request clarification when sport and competition are specified", async () => {
    mockInvoke.mockResolvedValueOnce(
      classifierResponse({
        topicDomain: "team_selection",
        detectedNgbIds: ["usa_triathlon"],
        queryIntent: "procedural",
        hasTimeConstraint: false,
        shouldEscalate: false,
        needsClarification: false,
      }),
    );

    const state = makeState({
      messages: [
        new HumanMessage(
          "I'm a triathlete competing in the world series races, how will selection work?",
        ),
      ],
    });
    const result = await classifierNode(state);

    expect(result.needsClarification).toBe(false);
    expect(result.topicDomain).toBe("team_selection");
    expect(result.detectedNgbIds).toEqual(["usa_triathlon"]);
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
          clarificationQuestion:
            "Happy to help with that. Which sport are you asking about?",
        }),
      );

      const state = makeState({
        messages: [new HumanMessage("What are the age requirements?")],
      });

      const result = await classifierNode(state);

      // Without context, classifier should ask for clarification
      expect(result.needsClarification).toBe(true);
      expect(result.clarificationQuestion).toBe(
        "Happy to help with that. Which sport are you asking about?",
      );
    });
  });

  describe("multi-turn clarification avoids re-asking established context", () => {
    it("does not ask 'which sport?' when conversation was general (multi-03)", async () => {
      // User asked general Olympics questions for 2 turns, then asks about
      // challenging selection criteria → should discuss Section 9/CAS, not ask "which sport?"
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "dispute_resolution",
          detectedNgbIds: [],
          queryIntent: "procedural",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage("How does team selection work for the Olympics?"),
          new AIMessage(
            "Olympic team selection varies by sport, but generally each NGB sets qualification criteria...",
          ),
          new HumanMessage("What about the Paralympic selection process?"),
          new AIMessage(
            "Paralympic selection follows a similar structure. Each NGB establishes criteria...",
          ),
          new HumanMessage(
            "Has anyone ever successfully challenged selection criteria?",
          ),
        ],
      });

      const result = await classifierNode(state);

      expect(result.needsClarification).toBe(false);
      expect(result.topicDomain).toBe("dispute_resolution");

      // Verify the prompt sent to the model includes conversation history
      const promptArg = mockInvoke.mock.calls[0]![0]!;
      const promptText =
        typeof promptArg[0]?.content === "string"
          ? promptArg[0].content
          : String(promptArg);
      expect(promptText).toContain("Conversation History");
    });

    it("does not re-ask about citizenship when already established (multi-06)", async () => {
      // User identified as dual citizen in turn 1, asks about competing
      // for another country in turn 3 → should provide Olympic Charter rules
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "eligibility",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage(
            "I'm a dual citizen of the US and Canada. Can I compete for the US?",
          ),
          new AIMessage(
            "As a dual citizen, you can generally choose which country to represent, subject to eligibility rules...",
          ),
          new HumanMessage(
            "I competed for another country two years ago. Does that change anything?",
          ),
        ],
      });

      const result = await classifierNode(state);

      expect(result.needsClarification).toBe(false);
      expect(result.topicDomain).toBe("eligibility");
    });

    it("respects general framing without demanding sport specificity", async () => {
      // Conversation has been general with no sport mentioned — follow-up
      // should also not demand sport specificity
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "athlete_rights",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage("What rights do Olympic athletes have?"),
          new AIMessage(
            "Athletes have several rights under the Ted Stevens Act and USOPC Bylaws...",
          ),
          new HumanMessage("Can I use my own sponsors at competitions?"),
        ],
      });

      const result = await classifierNode(state);

      expect(result.needsClarification).toBe(false);
      expect(result.topicDomain).toBe("athlete_rights");
    });
  });

  describe("universal framework questions do not request clarification", () => {
    it("Section 9 selection dispute with unnamed NGB", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "dispute_resolution",
          detectedNgbIds: [],
          queryIntent: "procedural",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage(
            "My NGB changed selection criteria right before trials. Can I challenge this?",
          ),
        ],
      });
      const result = await classifierNode(state);

      expect(result.needsClarification).toBe(false);
      expect(result.topicDomain).toBe("dispute_resolution");
    });

    it("NGB blocking competition over fees", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "dispute_resolution",
          detectedNgbIds: [],
          queryIntent: "procedural",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage(
            "My NGB won't let me compete because of unresolved fees.",
          ),
        ],
      });
      const result = await classifierNode(state);

      expect(result.needsClarification).toBe(false);
    });

    it("Paralympic board representation violation", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "governance",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage(
            "I'm a Paralympic athlete — my NGB has no disabled athletes on the board. Is this a violation?",
          ),
        ],
      });
      const result = await classifierNode(state);

      expect(result.needsClarification).toBe(false);
      expect(result.topicDomain).toBe("governance");
    });

    it("NGB board athlete rep requirements", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "governance",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage(
            "I want to run for my NGB's board as an athlete rep. What are the requirements?",
          ),
        ],
      });
      const result = await classifierNode(state);

      expect(result.needsClarification).toBe(false);
      expect(result.topicDomain).toBe("governance");
    });

    it("TUE and selection eligibility", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "anti_doping",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          needsClarification: false,
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage(
            "I need a TUE for ADHD medication — will it affect team selection eligibility?",
          ),
        ],
      });
      const result = await classifierNode(state);

      expect(result.needsClarification).toBe(false);
      expect(result.topicDomain).toBe("anti_doping");
    });
  });

  describe("emotionalState detection", () => {
    it("returns emotionalState from classifier response", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "safesport",
          detectedNgbIds: [],
          queryIntent: "escalation",
          hasTimeConstraint: false,
          shouldEscalate: true,
          emotionalState: "fearful",
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage("I'm terrified my coach will retaliate if I report"),
        ],
      });
      const result = await classifierNode(state);
      expect(result.emotionalState).toBe("fearful");
    });

    it("returns neutral on error fallback", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("API error"));

      const state = makeState();
      const result = await classifierNode(state);
      expect(result.emotionalState).toBe("neutral");
    });

    it("returns neutral for empty messages", async () => {
      const state = makeState({ messages: [] });
      const result = await classifierNode(state);
      expect(result.emotionalState).toBe("neutral");
    });

    it("classifies governance complaint as neutral, not distressed", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "governance",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          emotionalState: "neutral",
        }),
      );

      const state = makeState({
        messages: [new HumanMessage("athletes don't have a voice in my NGB")],
      });
      const result = await classifierNode(state);
      expect(result.emotionalState).toBe("neutral");
    });

    it("classifies frustration with process as neutral", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "team_selection",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          emotionalState: "neutral",
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage("I'm frustrated with the selection criteria"),
        ],
      });
      const result = await classifierNode(state);
      expect(result.emotionalState).toBe("neutral");
    });

    it("classifies institutional criticism as neutral", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "governance",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          emotionalState: "neutral",
        }),
      );

      const state = makeState({
        messages: [new HumanMessage("the system is broken and nobody cares")],
      });
      const result = await classifierNode(state);
      expect(result.emotionalState).toBe("neutral");
    });

    it("classifies advocacy language as neutral", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "governance",
          detectedNgbIds: [],
          queryIntent: "factual",
          hasTimeConstraint: false,
          shouldEscalate: false,
          emotionalState: "neutral",
        }),
      );

      const state = makeState({
        messages: [new HumanMessage("my NGB isn't following its own bylaws")],
      });
      const result = await classifierNode(state);
      expect(result.emotionalState).toBe("neutral");
    });

    it("classifies genuine personal distress as distressed", async () => {
      mockInvoke.mockResolvedValueOnce(
        classifierResponse({
          topicDomain: "safesport",
          detectedNgbIds: [],
          queryIntent: "general",
          hasTimeConstraint: false,
          shouldEscalate: false,
          emotionalState: "distressed",
        }),
      );

      const state = makeState({
        messages: [
          new HumanMessage("I feel completely alone and I can't go on"),
        ],
      });
      const result = await classifierNode(state);
      expect(result.emotionalState).toBe("distressed");
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
      expect(result.emotionalState).toBe("neutral");
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

  it("accepts athlete_safety as a valid domain", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "athlete_safety",
        detectedNgbIds: [],
        queryIntent: "factual",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    expect(output.topicDomain).toBe("athlete_safety");
    expect(warnings).toHaveLength(0);
  });

  it("accepts financial_assistance as a valid domain", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "financial_assistance",
        detectedNgbIds: [],
        queryIntent: "factual",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    expect(output.topicDomain).toBe("financial_assistance");
    expect(warnings).toHaveLength(0);
  });

  it("warns on invalid topicDomain and leaves it undefined", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "made_up_domain",
        detectedNgbIds: [],
        queryIntent: "general",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    expect(output.topicDomain).toBeUndefined();
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

    expect(output.topicDomain).toBeUndefined();
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

  it("parses valid emotionalState from response", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "safesport",
        detectedNgbIds: [],
        queryIntent: "escalation",
        hasTimeConstraint: false,
        shouldEscalate: true,
        emotionalState: "fearful",
      }),
    );

    expect(output.emotionalState).toBe("fearful");
    expect(warnings).toHaveLength(0);
  });

  it("defaults emotionalState to neutral when field is missing", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "team_selection",
        detectedNgbIds: [],
        queryIntent: "factual",
        hasTimeConstraint: false,
        shouldEscalate: false,
      }),
    );

    expect(output.emotionalState).toBe("neutral");
    expect(warnings).toHaveLength(0);
  });

  it("defaults emotionalState to neutral with warning for invalid value", () => {
    const { output, warnings } = parseClassifierResponse(
      JSON.stringify({
        topicDomain: "team_selection",
        detectedNgbIds: [],
        queryIntent: "factual",
        hasTimeConstraint: false,
        shouldEscalate: false,
        emotionalState: "angry",
      }),
    );

    expect(output.emotionalState).toBe("neutral");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Invalid emotionalState");
    expect(warnings[0]).toContain("angry");
  });
});
