import { describe, it, expect } from "vitest";
import { needsMoreInfo } from "./needsMoreInfo.js";
import { makeDefaultState, type AgentState } from "../state.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return makeDefaultState(overrides);
}

describe("needsMoreInfo", () => {
  it('routes to "researcher" in gray zone (confidence 0.6)', () => {
    const state = makeState({
      retrievalConfidence: 0.6,
      webSearchResults: [],
      webSearchResultUrls: [],
      expansionAttempted: false,
    });
    expect(needsMoreInfo(state)).toBe("researcher");
  });

  it('routes to "retrievalExpander" below threshold when expansion not attempted', () => {
    const state = makeState({
      retrievalConfidence: 0.3,
      webSearchResults: [],
      webSearchResultUrls: [],
      expansionAttempted: false,
    });
    expect(needsMoreInfo(state)).toBe("retrievalExpander");
  });

  it('routes to "researcher" below threshold when expansion already attempted', () => {
    const state = makeState({
      retrievalConfidence: 0.3,
      webSearchResults: [],
      webSearchResultUrls: [],
      expansionAttempted: true,
    });
    expect(needsMoreInfo(state)).toBe("researcher");
  });

  it('routes to "synthesizer" above gray zone upper threshold', () => {
    const state = makeState({
      retrievalConfidence: 0.8,
      webSearchResults: [],
      webSearchResultUrls: [],
      expansionAttempted: false,
    });
    expect(needsMoreInfo(state)).toBe("synthesizer");
  });

  it('routes to "researcher" at lower gray-zone boundary (confidence 0.5)', () => {
    const state = makeState({
      retrievalConfidence: 0.5,
      webSearchResults: [],
      webSearchResultUrls: [],
    });
    expect(needsMoreInfo(state)).toBe("researcher");
  });

  it('routes to "synthesizer" above gray zone (confidence 0.75)', () => {
    const state = makeState({
      retrievalConfidence: 0.75,
      webSearchResults: [],
      webSearchResultUrls: [],
    });
    expect(needsMoreInfo(state)).toBe("synthesizer");
  });

  it('routes to "synthesizer" well above gray zone (confidence 0.9)', () => {
    const state = makeState({
      retrievalConfidence: 0.9,
      webSearchResults: [],
      webSearchResultUrls: [],
    });
    expect(needsMoreInfo(state)).toBe("synthesizer");
  });

  it('routes to "synthesizer" in gray zone when web results already exist', () => {
    const state = makeState({
      retrievalConfidence: 0.6,
      webSearchResults: ["result"],
    });
    expect(needsMoreInfo(state)).toBe("synthesizer");
  });

  it('routes to "synthesizer" when confidence is low but web results exist', () => {
    const state = makeState({
      retrievalConfidence: 0.2,
      webSearchResults: ["some result"],
    });
    expect(needsMoreInfo(state)).toBe("synthesizer");
  });

  it('routes to "retrievalExpander" at zero confidence with no prior expansion', () => {
    const state = makeState({
      retrievalConfidence: 0,
      webSearchResults: [],
      webSearchResultUrls: [],
      expansionAttempted: false,
    });
    expect(needsMoreInfo(state)).toBe("retrievalExpander");
  });
});
