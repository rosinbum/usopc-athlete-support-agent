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
  invokeAnthropic: vi.fn(),
  extractTextFromResponse: vi.fn(),
}));

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn(),
}));

import {
  InMemorySummaryStore,
  loadSummary,
  saveSummary,
  generateSummary,
  setSummaryStore,
  initConversationMemoryModel,
  resetConversationMemoryModel,
} from "./conversationMemory.js";
import { ChatAnthropic } from "@langchain/anthropic";
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

    it("evicts oldest entries when exceeding maxEntries", async () => {
      const store = new InMemorySummaryStore(3);

      await store.set("conv-1", "first");
      await store.set("conv-2", "second");
      await store.set("conv-3", "third");
      await store.set("conv-4", "fourth");

      // conv-1 (oldest) should have been evicted
      expect(await store.get("conv-1")).toBeUndefined();
      expect(await store.get("conv-2")).toBe("second");
      expect(await store.get("conv-3")).toBe("third");
      expect(await store.get("conv-4")).toBe("fourth");
      expect(store.size).toBe(3);
    });

    it("refreshes LRU order on get", async () => {
      const store = new InMemorySummaryStore(3);

      await store.set("conv-1", "first");
      await store.set("conv-2", "second");
      await store.set("conv-3", "third");

      // Access conv-1 to make it most recently used
      await store.get("conv-1");

      // Add a new entry — conv-2 (now oldest) should be evicted
      await store.set("conv-4", "fourth");

      expect(await store.get("conv-1")).toBe("first");
      expect(await store.get("conv-2")).toBeUndefined();
      expect(await store.get("conv-3")).toBe("third");
      expect(await store.get("conv-4")).toBe("fourth");
    });

    it("refreshes LRU order on set (update)", async () => {
      const store = new InMemorySummaryStore(3);

      await store.set("conv-1", "first");
      await store.set("conv-2", "second");
      await store.set("conv-3", "third");

      // Update conv-1 to make it most recently used
      await store.set("conv-1", "updated-first");

      // Add a new entry — conv-2 (now oldest) should be evicted
      await store.set("conv-4", "fourth");

      expect(await store.get("conv-1")).toBe("updated-first");
      expect(await store.get("conv-2")).toBeUndefined();
    });

    it("reports size via size getter", async () => {
      const store = new InMemorySummaryStore();
      expect(store.size).toBe(0);
      await store.set("conv-1", "summary");
      expect(store.size).toBe(1);
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

  describe("initConversationMemoryModel / resetConversationMemoryModel", () => {
    afterEach(() => {
      resetConversationMemoryModel();
    });

    it("uses injected model when initialized", async () => {
      const fakeModel = new ChatAnthropic();
      initConversationMemoryModel(fakeModel);

      mockInvokeAnthropic.mockResolvedValue({} as never);
      mockExtractText.mockReturnValue("summary");

      await generateSummary([new HumanMessage("hello")]);

      // invokeAnthropic should receive the injected model instance
      expect(mockInvokeAnthropic).toHaveBeenCalledWith(
        fakeModel,
        expect.any(Array),
      );
    });

    it("falls back to transient instance after reset", async () => {
      const fakeModel = new ChatAnthropic();
      initConversationMemoryModel(fakeModel);
      resetConversationMemoryModel();

      mockInvokeAnthropic.mockResolvedValue({} as never);
      mockExtractText.mockReturnValue("summary");

      await generateSummary([new HumanMessage("hello")]);

      // Should NOT receive the previously injected model (it was reset)
      const modelArg = mockInvokeAnthropic.mock.calls[0][0];
      expect(modelArg).not.toBe(fakeModel);
    });

    it("creates a new ChatAnthropic with config values on fallback", async () => {
      // No model initialized — fallback path
      const { ChatAnthropic: MockChatAnthropic } =
        await import("@langchain/anthropic");
      const mockCtor = vi.mocked(MockChatAnthropic);
      mockCtor.mockClear();

      mockInvokeAnthropic.mockResolvedValue({} as never);
      mockExtractText.mockReturnValue("summary");

      await generateSummary([new HumanMessage("hello")]);

      expect(mockCtor).toHaveBeenCalledWith({
        model: "claude-haiku-4-5-20251001",
        temperature: 0,
        maxTokens: 1024,
      });
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
