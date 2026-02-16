import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { stateContext } from "./nodeLogging.js";
import type { AgentState } from "../agent/state.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("test")],
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
    emotionalState: "neutral",
    qualityCheckResult: undefined,
    qualityRetryCount: 0,
    isComplexQuery: false,
    subQueries: [],
    ...overrides,
  };
}

describe("stateContext", () => {
  it("extracts key identifying fields", () => {
    const state = makeState({
      conversationId: "conv-123",
      topicDomain: "safesport",
      queryIntent: "factual",
      userSport: "swimming",
    });

    const ctx = stateContext(state);

    expect(ctx).toEqual({
      conversationId: "conv-123",
      topicDomain: "safesport",
      queryIntent: "factual",
      userSport: "swimming",
    });
  });

  it("returns undefined values when state fields are not set", () => {
    const state = makeState();
    const ctx = stateContext(state);

    expect(ctx.conversationId).toBeUndefined();
    expect(ctx.topicDomain).toBeUndefined();
    expect(ctx.queryIntent).toBeUndefined();
    expect(ctx.userSport).toBeUndefined();
  });
});
