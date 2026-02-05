import { describe, it, expect } from "vitest";
import { needsMoreInfo } from "./needsMoreInfo.js";
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
    needsClarification: false,
    clarificationQuestion: undefined,
    retrievalStatus: "success",
    ...overrides,
  };
}

describe("needsMoreInfo", () => {
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
