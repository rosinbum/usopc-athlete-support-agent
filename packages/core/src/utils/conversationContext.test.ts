import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

// Mock @usopc/shared before importing module under test
vi.mock("@usopc/shared", () => ({
  getOptionalEnv: vi.fn(),
}));

import {
  formatConversationHistory,
  buildContextualQuery,
  getMaxTurns,
} from "./conversationContext.js";
import { getOptionalEnv } from "@usopc/shared";

const mockGetOptionalEnv = vi.mocked(getOptionalEnv);

describe("conversationContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionalEnv.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getMaxTurns", () => {
    it("returns default value of 5 when env var not set", () => {
      mockGetOptionalEnv.mockReturnValue(undefined);
      expect(getMaxTurns()).toBe(5);
    });

    it("returns parsed value from env var", () => {
      mockGetOptionalEnv.mockReturnValue("10");
      expect(getMaxTurns()).toBe(10);
    });

    it("returns default for invalid (non-numeric) value", () => {
      mockGetOptionalEnv.mockReturnValue("invalid");
      expect(getMaxTurns()).toBe(5);
    });

    it("returns default for empty string", () => {
      mockGetOptionalEnv.mockReturnValue("");
      expect(getMaxTurns()).toBe(5);
    });
  });

  describe("formatConversationHistory", () => {
    it("returns empty string for empty messages array", () => {
      const result = formatConversationHistory([]);
      expect(result).toBe("");
    });

    it("returns empty string for single user message (no prior history)", () => {
      const messages = [new HumanMessage("What are the selection criteria?")];
      const result = formatConversationHistory(messages);
      expect(result).toBe("");
    });

    it("formats multi-turn conversation with role prefixes", () => {
      const messages = [
        new HumanMessage("What are the team selection criteria for swimming?"),
        new AIMessage(
          "USA Swimming selects athletes based on time standards...",
        ),
        new HumanMessage("What about alternates?"),
      ];
      const result = formatConversationHistory(messages);

      expect(result).toContain("User:");
      expect(result).toContain("Assistant:");
      expect(result).toContain(
        "What are the team selection criteria for swimming?",
      );
      expect(result).toContain(
        "USA Swimming selects athletes based on time standards...",
      );
      // Should NOT include the current (last) message
      expect(result).not.toContain("What about alternates?");
    });

    it("respects maxTurns limit", () => {
      const messages = [
        new HumanMessage("First question"),
        new AIMessage("First answer"),
        new HumanMessage("Second question"),
        new AIMessage("Second answer"),
        new HumanMessage("Third question"),
        new AIMessage("Third answer"),
        new HumanMessage("Fourth question"),
        new AIMessage("Fourth answer"),
        new HumanMessage("Current question"), // This is excluded as it's the current
      ];

      // With maxTurns=2, should only include 4 prior messages (2 turns = 2 exchanges)
      const result = formatConversationHistory(messages, { maxTurns: 2 });

      // Should include the last 2 turns before current (4 messages)
      expect(result).toContain("Third question");
      expect(result).toContain("Third answer");
      expect(result).toContain("Fourth question");
      expect(result).toContain("Fourth answer");

      // Should NOT include earlier turns
      expect(result).not.toContain("First question");
      expect(result).not.toContain("Second question");

      // Should NOT include current message
      expect(result).not.toContain("Current question");
    });

    it("handles AIMessage and HumanMessage types correctly", () => {
      const messages = [
        new HumanMessage("Human message"),
        new AIMessage("AI response"),
        new HumanMessage("Current"),
      ];
      const result = formatConversationHistory(messages);

      expect(result).toContain("User: Human message");
      expect(result).toContain("Assistant: AI response");
    });

    it("truncates long messages to prevent token bloat", () => {
      const longMessage = "A".repeat(1000);
      const messages = [
        new HumanMessage(longMessage),
        new AIMessage("Short response"),
        new HumanMessage("Current"),
      ];
      const result = formatConversationHistory(messages);

      // Should truncate to ~500 chars with ellipsis
      expect(result.length).toBeLessThan(longMessage.length);
      expect(result).toContain("...");
    });
  });

  describe("buildContextualQuery", () => {
    it("returns current message and empty context for single message", () => {
      const messages = [new HumanMessage("What are the selection criteria?")];
      const result = buildContextualQuery(messages);

      expect(result.currentMessage).toBe("What are the selection criteria?");
      expect(result.conversationContext).toBe("");
    });

    it("returns current message and context for multi-turn conversation", () => {
      const messages = [
        new HumanMessage("What are the team selection criteria for swimming?"),
        new AIMessage("USA Swimming selects athletes based on time standards."),
        new HumanMessage("What about alternates?"),
      ];
      const result = buildContextualQuery(messages);

      expect(result.currentMessage).toBe("What about alternates?");
      expect(result.conversationContext).toContain("team selection criteria");
      expect(result.conversationContext).toContain("swimming");
    });

    it("returns empty strings for empty messages array", () => {
      const result = buildContextualQuery([]);

      expect(result.currentMessage).toBe("");
      expect(result.conversationContext).toBe("");
    });

    it("respects maxTurns option", () => {
      const messages = [
        new HumanMessage("First"),
        new AIMessage("First response"),
        new HumanMessage("Second"),
        new AIMessage("Second response"),
        new HumanMessage("Third"),
        new AIMessage("Third response"),
        new HumanMessage("Current"),
      ];

      const result = buildContextualQuery(messages, { maxTurns: 1 });

      expect(result.currentMessage).toBe("Current");
      // With maxTurns=1, should only include 1 prior turn (2 messages)
      expect(result.conversationContext).toContain("Third");
      expect(result.conversationContext).toContain("Third response");
      expect(result.conversationContext).not.toContain("Second response");
    });
  });
});
