import { describe, it, expect, vi } from "vitest";

vi.mock("@usopc/shared", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { disclaimerGuardNode } from "./disclaimerGuard.js";
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

describe("disclaimerGuardNode", () => {
  it("returns empty object when there is no answer", async () => {
    const state = makeState({ answer: undefined });
    const result = await disclaimerGuardNode(state);
    expect(result).toEqual({});
  });

  it("appends a disclaimer to the answer", async () => {
    const state = makeState({ answer: "Here is your answer." });
    const result = await disclaimerGuardNode(state);
    expect(result.answer).toContain("Here is your answer.");
    expect(result.answer).toContain("---");
    expect(result.answer).toContain("does not constitute legal advice");
    expect(result.disclaimerRequired).toBe(true);
  });

  it("appends safesport-specific disclaimer for safesport domain", async () => {
    const state = makeState({
      answer: "SafeSport answer.",
      topicDomain: "safesport",
    });
    const result = await disclaimerGuardNode(state);
    expect(result.answer).toContain("call 911");
    expect(result.answer).toContain("SafeSport answer.");
  });

  it("appends anti-doping disclaimer for anti_doping domain", async () => {
    const state = makeState({
      answer: "Anti-doping answer.",
      topicDomain: "anti_doping",
    });
    const result = await disclaimerGuardNode(state);
    expect(result.answer).toContain("USADA");
    expect(result.answer).toContain("Anti-doping answer.");
  });

  it("appends dispute resolution disclaimer for dispute_resolution domain", async () => {
    const state = makeState({
      answer: "Dispute answer.",
      topicDomain: "dispute_resolution",
    });
    const result = await disclaimerGuardNode(state);
    expect(result.answer).toContain("Section 9 arbitration");
  });

  it("appends general disclaimer when topicDomain is undefined", async () => {
    const state = makeState({
      answer: "General answer.",
      topicDomain: undefined,
    });
    const result = await disclaimerGuardNode(state);
    expect(result.answer).toContain("does not constitute legal advice");
  });

  it("separates the answer and disclaimer with ---", async () => {
    const state = makeState({ answer: "Answer text." });
    const result = await disclaimerGuardNode(state);
    expect(result.answer).toContain("\n\n---\n\n");
  });
});
