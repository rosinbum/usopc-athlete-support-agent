import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { escalateNode } from "./escalate.js";
import { HumanMessage } from "@langchain/core/messages";
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
    emotionalState: "neutral",
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
    const state = makeState({ topicDomain: "dispute_resolution" });
    const result = await escalateNode(state);

    expect(result.escalation).toBeDefined();
    expect(result.escalation!.target).toBe("athlete_ombuds");
    expect(result.escalation!.organization).toBe("Athlete Ombuds");
    expect(result.answer).toContain("Athlete Ombuds");
  });

  it("returns immediate urgency for safesport domain", async () => {
    const state = makeState({
      topicDomain: "safesport",
      messages: [new HumanMessage("I need to report abuse")],
    });
    const result = await escalateNode(state);

    expect(result.escalation).toBeDefined();
    expect(result.escalation!.urgency).toBe("immediate");
    expect(result.answer).toContain("call 911");
    expect(result.answer).toContain("U.S. Center for SafeSport");
  });

  it("returns immediate urgency for anti_doping domain", async () => {
    const state = makeState({
      topicDomain: "anti_doping",
      messages: [new HumanMessage("I got notified of a doping violation")],
    });
    const result = await escalateNode(state);

    expect(result.escalation).toBeDefined();
    expect(result.escalation!.urgency).toBe("immediate");
    expect(result.answer).toContain("USADA");
  });

  it("returns immediate urgency when hasTimeConstraint is true", async () => {
    const state = makeState({
      topicDomain: "team_selection",
      hasTimeConstraint: true,
    });
    const result = await escalateNode(state);

    expect(result.escalation!.urgency).toBe("immediate");
  });

  it("returns standard urgency for governance domain without time constraint", async () => {
    const state = makeState({
      topicDomain: "governance",
      hasTimeConstraint: false,
    });
    const result = await escalateNode(state);

    expect(result.escalation!.urgency).toBe("standard");
    expect(result.answer).toContain("specialized authority");
  });

  it("falls back to dispute_resolution when topicDomain is undefined", async () => {
    const state = makeState({ topicDomain: undefined });
    const result = await escalateNode(state);

    expect(result.escalation).toBeDefined();
    // dispute_resolution is the fallback
    expect(result.answer).toContain("Athlete Ombuds");
  });

  it("includes contact details in the referral message", async () => {
    const state = makeState({ topicDomain: "safesport" });
    const result = await escalateNode(state);

    expect(result.answer).toContain("833-5US-SAFE");
    expect(result.answer).toContain("uscenterforsafesport.org");
  });

  it("includes a 'What They Can Help With' section", async () => {
    const state = makeState({ topicDomain: "dispute_resolution" });
    const result = await escalateNode(state);

    expect(result.answer).toContain("What They Can Help With");
    expect(result.answer).toContain("Section 9 arbitration");
  });

  it("includes multiple targets for domains with multiple escalation paths", async () => {
    const state = makeState({ topicDomain: "dispute_resolution" });
    const result = await escalateNode(state);

    // dispute_resolution has Athlete Ombuds and CAS
    expect(result.answer).toContain("Athlete Ombuds");
    expect(result.answer).toContain("Court of Arbitration for Sport");
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
