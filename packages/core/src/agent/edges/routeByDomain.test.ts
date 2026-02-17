import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("routeByDomain", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns "clarify" when needsClarification is true', () => {
    const state = makeState({ needsClarification: true });
    expect(routeByDomain(state)).toBe("clarify");
  });

  it('returns "clarify" even if escalation intent when clarification needed', () => {
    const state = makeState({
      queryIntent: "escalation",
      needsClarification: true,
    });
    expect(routeByDomain(state)).toBe("clarify");
  });

  it('returns "escalate" when queryIntent is escalation', () => {
    const state = makeState({ queryIntent: "escalation" });
    expect(routeByDomain(state)).toBe("escalate");
  });

  it('returns "queryPlanner" for factual intent (queryPlanner defaults on)', () => {
    const state = makeState({ queryIntent: "factual" });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });

  it('returns "queryPlanner" for procedural intent', () => {
    const state = makeState({ queryIntent: "procedural" });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });

  it('returns "queryPlanner" for deadline intent', () => {
    const state = makeState({ queryIntent: "deadline" });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });

  it('returns "queryPlanner" for general intent', () => {
    const state = makeState({ queryIntent: "general" });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });

  it('returns "queryPlanner" when queryIntent is undefined', () => {
    const state = makeState({ queryIntent: undefined });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });

  describe("queryPlanner feature flag", () => {
    it('returns "queryPlanner" when flag is enabled', () => {
      vi.stubEnv("FEATURE_QUERY_PLANNER", "true");
      const state = makeState({ queryIntent: "factual" });
      expect(routeByDomain(state)).toBe("queryPlanner");
    });

    it('returns "retriever" when flag is disabled', () => {
      vi.stubEnv("FEATURE_QUERY_PLANNER", "false");
      const state = makeState({ queryIntent: "factual" });
      expect(routeByDomain(state)).toBe("retriever");
    });

    it('still returns "clarify" when flag is enabled but clarification needed', () => {
      vi.stubEnv("FEATURE_QUERY_PLANNER", "true");
      const state = makeState({ needsClarification: true });
      expect(routeByDomain(state)).toBe("clarify");
    });

    it('still returns "escalate" when flag is enabled but escalation intent', () => {
      vi.stubEnv("FEATURE_QUERY_PLANNER", "true");
      const state = makeState({ queryIntent: "escalation" });
      expect(routeByDomain(state)).toBe("escalate");
    });
  });
});
