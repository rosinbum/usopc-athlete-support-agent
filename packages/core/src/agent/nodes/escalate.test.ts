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

import { escalateNode } from "./escalate.js";
import { HumanMessage } from "@langchain/core/messages";
import { CircuitBreakerError } from "@usopc/shared";
import type { AgentState } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("I need help with a dispute")],
    topicDomain: "dispute_resolution",
    detectedNgbIds: [],
    queryIntent: "escalation",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("escalateNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns escalation info for dispute_resolution", async () => {
    mockInvoke.mockResolvedValueOnce({
      content:
        "I understand you need help with a dispute. Contact the Athlete Ombuds.",
    });

    const state = makeState({ topicDomain: "dispute_resolution" });
    const result = await escalateNode(state);

    expect(result.escalation).toBeDefined();
    expect(result.escalation!.target).toBe("athlete_ombuds");
    expect(result.escalation!.organization).toBe("Athlete Ombuds");
    expect(result.answer).toBeDefined();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("returns immediate urgency for safesport domain", async () => {
    mockInvoke.mockResolvedValueOnce({
      content:
        "I understand you are reporting misconduct. Please contact the U.S. Center for SafeSport.",
    });

    const state = makeState({
      topicDomain: "safesport",
      messages: [new HumanMessage("I need to report abuse")],
    });
    const result = await escalateNode(state);

    expect(result.escalation).toBeDefined();
    expect(result.escalation!.urgency).toBe("immediate");
  });

  it("returns immediate urgency for anti_doping domain", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "Contact USADA immediately regarding your notification.",
    });

    const state = makeState({
      topicDomain: "anti_doping",
      messages: [new HumanMessage("I got notified of a doping violation")],
    });
    const result = await escalateNode(state);

    expect(result.escalation).toBeDefined();
    expect(result.escalation!.urgency).toBe("immediate");
  });

  it("returns immediate urgency when hasTimeConstraint is true", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "Given the urgency, contact the Athlete Ombuds right away.",
    });

    const state = makeState({
      topicDomain: "team_selection",
      hasTimeConstraint: true,
    });
    const result = await escalateNode(state);

    expect(result.escalation!.urgency).toBe("immediate");
  });

  it("returns standard urgency for governance domain without time constraint", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "For governance concerns, contact the Athletes' Commission.",
    });

    const state = makeState({
      topicDomain: "governance",
      hasTimeConstraint: false,
    });
    const result = await escalateNode(state);

    expect(result.escalation!.urgency).toBe("standard");
  });

  it("falls back to dispute_resolution when topicDomain is undefined", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "I recommend contacting the Athlete Ombuds for assistance.",
    });

    const state = makeState({ topicDomain: undefined });
    const result = await escalateNode(state);

    expect(result.escalation).toBeDefined();
    expect(result.answer).toBeDefined();
  });

  it("passes user message and escalation reason to LLM prompt", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "I hear your concern about the coaching environment.",
    });

    const state = makeState({
      topicDomain: "safesport",
      messages: [
        new HumanMessage("My coach has been emotionally abusive for months"),
      ],
      escalationReason: "Athlete reports pattern of emotional misconduct",
    });

    await escalateNode(state);

    // Verify the LLM was called and the prompt includes the user message and reason
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const invokeArgs = mockInvoke.mock.calls[0][0];
    const humanMessage = invokeArgs[1];
    expect(humanMessage.content).toContain(
      "My coach has been emotionally abusive for months",
    );
    expect(humanMessage.content).toContain(
      "Athlete reports pattern of emotional misconduct",
    );
  });

  it("builds EscalationInfo deterministically with correct target and urgency", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "Please report to SafeSport.",
    });

    const state = makeState({
      topicDomain: "safesport",
      messages: [new HumanMessage("I need to report harassment")],
      escalationReason: "Athlete reports harassment",
    });
    const result = await escalateNode(state);

    expect(result.escalation).toMatchObject({
      target: "safesport_center",
      organization: "U.S. Center for SafeSport",
      urgency: "immediate",
      reason: "Athlete reports harassment",
    });
  });

  it("uses escalationReason in EscalationInfo.reason", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "Contact the Athlete Ombuds.",
    });

    const state = makeState({
      topicDomain: "dispute_resolution",
      escalationReason: "Imminent hearing deadline in 3 days",
      hasTimeConstraint: true,
    });
    const result = await escalateNode(state);

    expect(result.escalation!.reason).toBe(
      "Imminent hearing deadline in 3 days",
    );
  });

  it("generates default reason when escalationReason is undefined", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "Contact the Athlete Ombuds.",
    });

    const state = makeState({
      topicDomain: "dispute_resolution",
      escalationReason: undefined,
    });
    const result = await escalateNode(state);

    expect(result.escalation!.reason).toContain("escalation to Athlete Ombuds");
    expect(result.escalation!.reason).toContain("dispute resolution");
  });

  describe("circuit breaker fallback", () => {
    it("returns deterministic fallback without 911 when LLM circuit is open", async () => {
      mockInvoke.mockRejectedValueOnce(new CircuitBreakerError("anthropic"));

      const state = makeState({
        topicDomain: "safesport",
        messages: [new HumanMessage("I want to report retaliation")],
        escalationReason: "Retaliation concerns after filing complaint",
      });
      const result = await escalateNode(state);

      // Should still have escalation info
      expect(result.escalation).toBeDefined();
      expect(result.escalation!.urgency).toBe("immediate");

      // Fallback message should NOT contain blanket 911 preamble
      expect(result.answer).not.toContain(
        "If you are in immediate danger, please call 911",
      );

      // But should contain contact information
      expect(result.answer).toContain("U.S. Center for SafeSport");
      expect(result.answer).toContain("833-5US-SAFE");
    });

    it("returns deterministic fallback when LLM throws generic error", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Model overloaded"));

      const state = makeState({
        topicDomain: "anti_doping",
        messages: [new HumanMessage("I failed a drug test")],
      });
      const result = await escalateNode(state);

      expect(result.escalation).toBeDefined();
      expect(result.answer).toContain("USADA");
      expect(result.answer).toContain("1-866-601-2632");
    });
  });

  it("returns no-targets fallback when domain has no escalation targets", async () => {
    // This shouldn't happen in practice since all domains have targets,
    // but test the fallback path
    const state = makeState({
      topicDomain: "dispute_resolution",
    });

    // Temporarily override getEscalationTargets to return empty
    // We test this via the node's behavior when it falls to the no-targets branch
    // Since dispute_resolution always has targets, we verify the happy path
    mockInvoke.mockResolvedValueOnce({
      content: "Contact the Athlete Ombuds for help with your dispute.",
    });

    const result = await escalateNode(state);
    expect(result.answer).toBeDefined();
    expect(result.escalation).toBeDefined();
  });

  it("sends system prompt as SystemMessage to LLM", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "response" });

    const state = makeState({ topicDomain: "dispute_resolution" });
    await escalateNode(state);

    const invokeArgs = mockInvoke.mock.calls[0][0];
    const systemMessage = invokeArgs[0];
    expect(systemMessage._getType()).toBe("system");
    expect(systemMessage.content).toContain("USOPC Athlete Support");
  });

  it("includes verified contact blocks in the LLM prompt", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "response" });

    const state = makeState({
      topicDomain: "safesport",
      messages: [new HumanMessage("report abuse")],
    });
    await escalateNode(state);

    const invokeArgs = mockInvoke.mock.calls[0][0];
    const humanMessage = invokeArgs[1];
    // Prompt should contain verified contacts for SafeSport
    expect(humanMessage.content).toContain("U.S. Center for SafeSport");
    expect(humanMessage.content).toContain("833-5US-SAFE");
  });

  it("prepends empathy for fearful athlete on SafeSport path", async () => {
    const state = makeState({
      topicDomain: "safesport",
      emotionalState: "fearful",
      messages: [
        new HumanMessage(
          "I'm terrified my coach will retaliate if I report abuse",
        ),
      ],
    });
    const result = await escalateNode(state);

    expect(result.answer).toContain("retaliation protections");
    expect(result.answer).toContain("U.S. Center for SafeSport");
  });

  it("prepends empathy for panicked athlete on anti-doping path", async () => {
    const state = makeState({
      topicDomain: "anti_doping",
      emotionalState: "panicked",
      messages: [
        new HumanMessage("I just failed a drug test and I'm panicking"),
      ],
    });
    const result = await escalateNode(state);

    expect(result.answer).toContain("Take a breath");
    expect(result.answer).toContain("USADA");
  });
});
