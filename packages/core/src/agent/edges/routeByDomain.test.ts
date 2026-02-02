import { describe, it, expect } from "vitest";
import { routeByDomain } from "./routeByDomain.js";
import type { AgentState } from "../state.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [],
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

describe("routeByDomain", () => {
  it('returns "escalate" when queryIntent is escalation', () => {
    const state = makeState({ queryIntent: "escalation" });
    expect(routeByDomain(state)).toBe("escalate");
  });

  it('returns "retriever" for factual intent', () => {
    const state = makeState({ queryIntent: "factual" });
    expect(routeByDomain(state)).toBe("retriever");
  });

  it('returns "retriever" for procedural intent', () => {
    const state = makeState({ queryIntent: "procedural" });
    expect(routeByDomain(state)).toBe("retriever");
  });

  it('returns "retriever" for deadline intent', () => {
    const state = makeState({ queryIntent: "deadline" });
    expect(routeByDomain(state)).toBe("retriever");
  });

  it('returns "retriever" for general intent', () => {
    const state = makeState({ queryIntent: "general" });
    expect(routeByDomain(state)).toBe("retriever");
  });

  it('returns "retriever" when queryIntent is undefined', () => {
    const state = makeState({ queryIntent: undefined });
    expect(routeByDomain(state)).toBe("retriever");
  });
});
