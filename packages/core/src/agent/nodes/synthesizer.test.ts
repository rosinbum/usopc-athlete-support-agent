import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn();

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    logger: {
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
    getOptionalSecretValue: vi.fn().mockReturnValue("5"),
  };
});

import { synthesizerNode } from "./synthesizer.js";
import { HumanMessage } from "@langchain/core/messages";
import { CircuitBreakerError } from "@usopc/shared";
import type { AgentState } from "../state.js";
import type { RetrievedDocument } from "../../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [
      new HumanMessage("How do I file a Section 9 arbitration complaint?"),
    ],
    topicDomain: "dispute_resolution",
    detectedNgbIds: [],
    queryIntent: "procedural",
    retrievedDocuments: [],
    webSearchResults: [],
    retrievalConfidence: 0.7,
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

function makeDoc(content: string): RetrievedDocument {
  return {
    content,
    metadata: {
      documentTitle: "Test Doc",
      documentType: "policy",
      sourceUrl: "https://example.com",
    },
    score: 0.1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("synthesizerNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a rephrasing prompt when user question is empty", async () => {
    const state = makeState({ messages: [] });
    const result = await synthesizerNode(state);
    expect(result.answer).toContain("rephrase");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("generates an answer from the model", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "To file a Section 9 complaint, you need to...",
    });

    const state = makeState({
      retrievedDocuments: [makeDoc("Section 9 allows athletes to file...")],
    });
    const result = await synthesizerNode(state);

    expect(result.answer).toBe("To file a Section 9 complaint, you need to...");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("handles array content from Claude response", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: [
        { type: "text", text: "Part 1. " },
        { type: "text", text: "Part 2." },
      ],
    });

    const state = makeState({
      retrievedDocuments: [makeDoc("context")],
    });
    const result = await synthesizerNode(state);
    expect(result.answer).toBe("Part 1. Part 2.");
  });

  it("passes both documents and web results to the model", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "Combined answer from docs and web.",
    });

    const state = makeState({
      retrievedDocuments: [makeDoc("doc context")],
      webSearchResults: ["Web result about Section 9"],
    });

    const result = await synthesizerNode(state);
    expect(result.answer).toBe("Combined answer from docs and web.");

    // Verify the prompt includes both sources
    const invokeArgs = mockInvoke.mock.calls[0][0];
    const humanMessage = invokeArgs[1];
    expect(humanMessage.content).toContain("doc context");
    expect(humanMessage.content).toContain("Web result about Section 9");
  });

  it("includes fallback context when no documents or web results", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "I don't have specific documents about that.",
    });

    const state = makeState({
      retrievedDocuments: [],
      webSearchResults: [],
    });

    await synthesizerNode(state);
    const invokeArgs = mockInvoke.mock.calls[0][0];
    const humanMessage = invokeArgs[1];
    expect(humanMessage.content).toContain(
      "No documents or search results were found",
    );
  });

  it("returns error message when model throws", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Model overloaded"));

    const state = makeState({
      retrievedDocuments: [makeDoc("context")],
    });
    const result = await synthesizerNode(state);
    expect(result.answer).toContain("encountered an error");
    expect(result.answer).toContain("ombudsman@usathlete.org");
  });

  it("sends the system prompt as a SystemMessage", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "answer" });

    const state = makeState({
      retrievedDocuments: [makeDoc("context")],
    });
    await synthesizerNode(state);

    const invokeArgs = mockInvoke.mock.calls[0][0];
    const systemMessage = invokeArgs[0];
    expect(systemMessage._getType()).toBe("system");
    expect(systemMessage.content).toContain("USOPC Athlete Support");
  });

  describe("retrievalStatus handling", () => {
    it("returns error message when retrievalStatus is error and no context available", async () => {
      const state = makeState({
        retrievalStatus: "error",
        retrievedDocuments: [],
        webSearchResults: [],
      });

      const result = await synthesizerNode(state);
      expect(result.answer).toContain("unable to search our knowledge base");
      expect(result.answer).toContain("ombudsman@usathlete.org");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("proceeds with synthesis when retrievalStatus is error but documents exist", async () => {
      mockInvoke.mockResolvedValueOnce({
        content: "Answer from available docs",
      });

      const state = makeState({
        retrievalStatus: "error",
        retrievedDocuments: [makeDoc("some doc")],
        webSearchResults: [],
      });

      const result = await synthesizerNode(state);
      expect(result.answer).toBe("Answer from available docs");
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("proceeds with synthesis when retrievalStatus is error but web results exist", async () => {
      mockInvoke.mockResolvedValueOnce({
        content: "Answer from web",
      });

      const state = makeState({
        retrievalStatus: "error",
        retrievedDocuments: [],
        webSearchResults: ["some web result"],
      });

      const result = await synthesizerNode(state);
      expect(result.answer).toBe("Answer from web");
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("proceeds normally when retrievalStatus is success", async () => {
      mockInvoke.mockResolvedValueOnce({
        content: "Normal answer",
      });

      const state = makeState({
        retrievalStatus: "success",
        retrievedDocuments: [makeDoc("context")],
      });

      const result = await synthesizerNode(state);
      expect(result.answer).toBe("Normal answer");
    });
  });

  describe("CircuitBreakerError handling", () => {
    it("returns rate-limit message when circuit breaker is open", async () => {
      mockInvoke.mockRejectedValueOnce(new CircuitBreakerError("anthropic"));

      const state = makeState({
        retrievedDocuments: [makeDoc("context")],
      });

      const result = await synthesizerNode(state);
      expect(result.answer).toContain("temporarily unable");
      expect(result.answer).toContain("high demand");
      expect(result.answer).toContain("ombudsman@usathlete.org");
    });

    it("returns generic error message for non-CircuitBreakerError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Model overloaded"));

      const state = makeState({
        retrievedDocuments: [makeDoc("context")],
      });

      const result = await synthesizerNode(state);
      expect(result.answer).toContain("encountered an error");
      expect(result.answer).not.toContain("high demand");
    });
  });
});
