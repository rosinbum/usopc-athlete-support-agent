import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { makeTestState } from "./stateFactory.js";

describe("makeTestState", () => {
  it("returns a valid AgentState with defaults", () => {
    const state = makeTestState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toBeInstanceOf(HumanMessage);
    expect(state.retrievalConfidence).toBe(0);
    expect(state.disclaimerRequired).toBe(true);
    expect(state.needsClarification).toBe(false);
    expect(state.retrievalStatus).toBe("success");
    expect(state.emotionalState).toBe("neutral");
    expect(state.qualityRetryCount).toBe(0);
  });

  it("returns arrays initialized to empty", () => {
    const state = makeTestState();
    expect(state.detectedNgbIds).toEqual([]);
    expect(state.retrievedDocuments).toEqual([]);
    expect(state.webSearchResults).toEqual([]);
    expect(state.webSearchResultUrls).toEqual([]);
    expect(state.citations).toEqual([]);
    expect(state.reformulatedQueries).toEqual([]);
    expect(state.subQueries).toEqual([]);
  });

  it("returns undefined for optional fields", () => {
    const state = makeTestState();
    expect(state.topicDomain).toBeUndefined();
    expect(state.answer).toBeUndefined();
    expect(state.escalation).toBeUndefined();
    expect(state.disclaimer).toBeUndefined();
    expect(state.conversationId).toBeUndefined();
    expect(state.userSport).toBeUndefined();
  });

  it("applies overrides", () => {
    const state = makeTestState({
      answer: "test answer",
      retrievalConfidence: 0.95,
      userSport: "swimming",
    });
    expect(state.answer).toBe("test answer");
    expect(state.retrievalConfidence).toBe(0.95);
    expect(state.userSport).toBe("swimming");
  });

  it("override replaces default messages", () => {
    const customMsg = new HumanMessage("Custom question");
    const state = makeTestState({ messages: [customMsg] });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toBe(customMsg);
  });
});
