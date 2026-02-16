import { describe, it, expect } from "vitest";
import { needsMoreInfo, createNeedsMoreInfo } from "./needsMoreInfo.js";
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
    conversationSummary: undefined,
    userSport: undefined,
    needsClarification: false,
    clarificationQuestion: undefined,
    escalationReason: undefined,
    retrievalStatus: "success",
    emotionalState: "neutral",
    qualityCheckResult: undefined,
    qualityRetryCount: 0,
    expansionAttempted: false,
    reformulatedQueries: [],
    isComplexQuery: false,
    subQueries: [],
    ...overrides,
  };
}

describe("needsMoreInfo (backward-compatible export)", () => {
  it('returns "synthesizer" when confidence is at the threshold', () => {
    const state = makeState({ retrievalConfidence: 0.5 });
    expect(needsMoreInfo(state)).toBe("synthesizer");
  });

  it('returns "synthesizer" when confidence is above the threshold', () => {
    const state = makeState({ retrievalConfidence: 0.8 });
    expect(needsMoreInfo(state)).toBe("synthesizer");
  });

  it('returns "researcher" when confidence is below threshold and no web results', () => {
    const state = makeState({
      retrievalConfidence: 0.3,
      webSearchResults: [],
    });
    expect(needsMoreInfo(state)).toBe("researcher");
  });

  it('returns "synthesizer" when confidence is low but web results exist', () => {
    const state = makeState({
      retrievalConfidence: 0.2,
      webSearchResults: ["some result"],
    });
    expect(needsMoreInfo(state)).toBe("synthesizer");
  });

  it('returns "researcher" when confidence is zero and no web results', () => {
    const state = makeState({
      retrievalConfidence: 0,
      webSearchResults: [],
    });
    expect(needsMoreInfo(state)).toBe("researcher");
  });
});

describe("createNeedsMoreInfo(true) — expansion enabled", () => {
  const edgeFn = createNeedsMoreInfo(true);

  it('routes to "retrievalExpander" when confidence low and expansion not attempted', () => {
    const state = makeState({
      retrievalConfidence: 0.3,
      webSearchResults: [],
      expansionAttempted: false,
    });
    expect(edgeFn(state)).toBe("retrievalExpander");
  });

  it('routes to "researcher" when confidence low and expansion already attempted', () => {
    const state = makeState({
      retrievalConfidence: 0.3,
      webSearchResults: [],
      expansionAttempted: true,
    });
    expect(edgeFn(state)).toBe("researcher");
  });

  it('routes to "synthesizer" when confidence high regardless of expansion flag', () => {
    const state = makeState({
      retrievalConfidence: 0.8,
      expansionAttempted: false,
    });
    expect(edgeFn(state)).toBe("synthesizer");
  });

  it('routes to "synthesizer" when web results exist regardless of expansion', () => {
    const state = makeState({
      retrievalConfidence: 0.2,
      webSearchResults: ["result"],
      expansionAttempted: false,
    });
    expect(edgeFn(state)).toBe("synthesizer");
  });

  it('routes to "retrievalExpander" at zero confidence with no prior expansion', () => {
    const state = makeState({
      retrievalConfidence: 0,
      webSearchResults: [],
      expansionAttempted: false,
    });
    expect(edgeFn(state)).toBe("retrievalExpander");
  });
});

describe("createNeedsMoreInfo(false) — expansion disabled", () => {
  const edgeFn = createNeedsMoreInfo(false);

  it('never routes to "retrievalExpander"', () => {
    const state = makeState({
      retrievalConfidence: 0.3,
      webSearchResults: [],
      expansionAttempted: false,
    });
    expect(edgeFn(state)).toBe("researcher");
  });
});
