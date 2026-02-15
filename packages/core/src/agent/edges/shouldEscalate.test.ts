import { describe, it, expect } from "vitest";
import { shouldEscalate } from "./shouldEscalate.js";
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
    escalationReason: undefined,
    retrievalStatus: "success",
    ...overrides,
  };
}

describe("shouldEscalate", () => {
  it("returns true when queryIntent is escalation", () => {
    const state = makeState({ queryIntent: "escalation" });
    expect(shouldEscalate(state)).toBe(true);
  });

  it("returns true for safesport domain with time constraint", () => {
    const state = makeState({
      topicDomain: "safesport",
      hasTimeConstraint: true,
      queryIntent: "factual",
    });
    expect(shouldEscalate(state)).toBe(true);
  });

  it("returns true for anti_doping domain with time constraint", () => {
    const state = makeState({
      topicDomain: "anti_doping",
      hasTimeConstraint: true,
      queryIntent: "factual",
    });
    expect(shouldEscalate(state)).toBe(true);
  });

  it("returns false for safesport domain without time constraint", () => {
    const state = makeState({
      topicDomain: "safesport",
      hasTimeConstraint: false,
      queryIntent: "factual",
    });
    expect(shouldEscalate(state)).toBe(false);
  });

  it("returns false for non-urgent domain even with time constraint", () => {
    const state = makeState({
      topicDomain: "team_selection",
      hasTimeConstraint: true,
      queryIntent: "factual",
    });
    expect(shouldEscalate(state)).toBe(false);
  });

  it("returns false when no special conditions are met", () => {
    const state = makeState({
      topicDomain: "governance",
      queryIntent: "general",
      hasTimeConstraint: false,
    });
    expect(shouldEscalate(state)).toBe(false);
  });

  it("returns false when topicDomain is undefined", () => {
    const state = makeState({
      topicDomain: undefined,
      queryIntent: "general",
      hasTimeConstraint: true,
    });
    expect(shouldEscalate(state)).toBe(false);
  });
});
