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

vi.mock("@usopc/shared", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { classifierNode } from "./classifier.js";
import { HumanMessage } from "@langchain/core/messages";
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
});
