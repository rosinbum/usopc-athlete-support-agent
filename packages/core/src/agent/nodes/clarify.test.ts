import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { clarifyNode } from "./clarify.js";
import type { AgentState } from "../state.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("What are the selection criteria?")],
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
    needsClarification: true,
    clarificationQuestion: undefined,
    escalationReason: undefined,
    retrievalStatus: "success",
    ...overrides,
  };
}

describe("clarifyNode", () => {
  it("returns the clarification question from state", async () => {
    const state = makeState({
      clarificationQuestion:
        "Which sport's selection criteria are you asking about?",
    });

    const result = await clarifyNode(state);

    expect(result.answer).toBe(
      "Which sport's selection criteria are you asking about?",
    );
  });

  it("returns default clarification when no question provided", async () => {
    const state = makeState({
      clarificationQuestion: undefined,
    });

    const result = await clarifyNode(state);

    expect(result.answer).toContain("I'd like to help you");
    expect(result.answer).toContain("more information");
  });

  it("sets disclaimerRequired to false", async () => {
    const state = makeState({
      clarificationQuestion: "Which sport?",
    });

    const result = await clarifyNode(state);

    expect(result.disclaimerRequired).toBe(false);
  });

  it("handles empty clarification question", async () => {
    const state = makeState({
      clarificationQuestion: "",
    });

    const result = await clarifyNode(state);

    // Empty string should also trigger default
    expect(result.answer).toContain("more information");
  });
});
