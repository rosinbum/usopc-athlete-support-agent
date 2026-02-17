import { describe, it, expect } from "vitest";
import { emotionalSupportNode } from "./emotionalSupport.js";
import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("test")],
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

describe("emotionalSupportNode", () => {
  it("returns undefined context for neutral state", async () => {
    const state = makeState({ emotionalState: "neutral" });
    const result = await emotionalSupportNode(state);
    expect(result.emotionalSupportContext).toBeUndefined();
  });

  it("returns populated context for distressed state", async () => {
    const state = makeState({
      emotionalState: "distressed",
      topicDomain: "safesport",
    });
    const result = await emotionalSupportNode(state);
    expect(result.emotionalSupportContext).toBeDefined();
    expect(result.emotionalSupportContext!.acknowledgment).toBeTruthy();
    expect(result.emotionalSupportContext!.guidance).toBeTruthy();
    expect(
      result.emotionalSupportContext!.safetyResources.length,
    ).toBeGreaterThan(0);
    expect(
      result.emotionalSupportContext!.toneModifiers.length,
    ).toBeGreaterThan(0);
  });

  it("handles missing topicDomain", async () => {
    const state = makeState({
      emotionalState: "panicked",
      topicDomain: undefined,
    });
    const result = await emotionalSupportNode(state);
    expect(result.emotionalSupportContext).toBeDefined();
    expect(result.emotionalSupportContext!.acknowledgment).toBeTruthy();
  });

  it("returns fearful-specific context", async () => {
    const state = makeState({
      emotionalState: "fearful",
      topicDomain: "anti_doping",
    });
    const result = await emotionalSupportNode(state);
    expect(result.emotionalSupportContext).toBeDefined();
    expect(result.emotionalSupportContext!.acknowledgment).toContain(
      "confidentiality",
    );
  });
});
