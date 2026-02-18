import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

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
  };
});

vi.mock("../config/index.js", () => ({
  getModelConfig: () =>
    Promise.resolve({
      classifier: {
        model: "claude-haiku-4-5-20251001",
        temperature: 0,
        maxTokens: 1024,
      },
    }),
}));

vi.mock("./anthropicService.js", () => ({
  createChatAnthropic: vi.fn(),
  invokeAnthropic: vi.fn(),
  extractTextFromResponse: vi.fn(),
}));

import {
  InMemorySummaryStore,
  loadSummary,
  saveSummary,
  generateSummary,
  setSummaryStore,
} from "./conversationMemory.js";
import {
  invokeAnthropic,
  extractTextFromResponse,
} from "./anthropicService.js";

const mockInvokeAnthropic = vi.mocked(invokeAnthropic);
const mockExtractText = vi.mocked(extractTextFromResponse);

describe("conversationMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to a fresh in-memory store for each test
    setSummaryStore(new InMemorySummaryStore());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("InMemorySummaryStore", () => {
    it("returns undefined when key is missing", async () => {
      const store = new InMemorySummaryStore();
      expect(await store.get("nonexistent")).toBeUndefined();
    });

    it("stores and retrieves a summary", async () => {
      const store = new InMemorySummaryStore();
      await store.set("conv-1", "Summary text");
      expect(await store.get("conv-1")).toBe("Summary text");
    });

    it("returns undefined when entry has expired", async () => {
      const store = new InMemorySummaryStore();
      const realNow = Date.now;

      // Set the summary at current time
      await store.set("conv-1", "Summary text");

      // Advance time past TTL (1 hour + 1ms)
      vi.spyOn(Date, "now").mockReturnValue(realNow() + 60 * 60 * 1000 + 1);

      expect(await store.get("conv-1")).toBeUndefined();

      vi.spyOn(Date, "now").mockRestore();
    });
  });

  describe("loadSummary / saveSummary", () => {
    it("returns undefined when no summary cached", async () => {
      expect(await loadSummary("conv-1")).toBeUndefined();
    });

    it("saves and loads a summary", async () => {
      await saveSummary("conv-1", "Test summary");
      expect(await loadSummary("conv-1")).toBe("Test summary");
    });
  });

  describe("generateSummary", () => {
    it("calls Haiku with correct prompt and returns text", async () => {
      const summaryText =
        "The user is a swimmer asking about selection criteria.";
      mockInvokeAnthropic.mockResolvedValue({} as never);
      mockExtractText.mockReturnValue(summaryText);

      const messages = [
        new HumanMessage("What are the selection criteria for swimming?"),
        new AIMessage("USA Swimming selects athletes based on time standards."),
      ];

      const result = await generateSummary(messages);

      expect(mockInvokeAnthropic).toHaveBeenCalledOnce();
      expect(result).toBe(summaryText);

      // Verify the prompt includes conversation content
      const promptArg = mockInvokeAnthropic.mock.calls[0][1];
      const promptContent =
        typeof promptArg[0].content === "string"
          ? promptArg[0].content
          : JSON.stringify(promptArg[0].content);
      expect(promptContent).toContain("selection criteria");
    });

    it("includes existing summary when provided", async () => {
      const existingSummary = "Previous context about the user.";
      mockInvokeAnthropic.mockResolvedValue({} as never);
      mockExtractText.mockReturnValue("Updated summary");

      const messages = [new HumanMessage("Follow-up question")];

      await generateSummary(messages, existingSummary);

      const promptArg = mockInvokeAnthropic.mock.calls[0][1];
      const promptContent =
        typeof promptArg[0].content === "string"
          ? promptArg[0].content
          : JSON.stringify(promptArg[0].content);
      expect(promptContent).toContain(existingSummary);
    });

    it("returns existing summary on failure", async () => {
      const existingSummary = "Previous context";
      mockInvokeAnthropic.mockRejectedValue(new Error("API error"));

      const messages = [new HumanMessage("Question")];
      const result = await generateSummary(messages, existingSummary);

      expect(result).toBe(existingSummary);
    });

    it("returns empty string on failure with no existing summary", async () => {
      mockInvokeAnthropic.mockRejectedValue(new Error("API error"));

      const messages = [new HumanMessage("Question")];
      const result = await generateSummary(messages);

      expect(result).toBe("");
    });
  });
});
