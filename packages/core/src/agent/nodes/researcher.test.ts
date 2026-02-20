import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("../../services/anthropicService.js", () => ({
  invokeAnthropic: vi.fn(),
  extractTextFromResponse: vi.fn(),
}));

import { createResearcherNode, type TavilySearchLike } from "./researcher.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { ChatAnthropic } from "@langchain/anthropic";
import type { AgentState } from "../state.js";
import {
  invokeAnthropic,
  extractTextFromResponse,
} from "../../services/anthropicService.js";

const mockInvokeAnthropic = vi.mocked(invokeAnthropic);
const mockExtractText = vi.mocked(extractTextFromResponse);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("What are USADA whereabouts requirements?")],
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

function makeMockTavily(result: unknown = ""): TavilySearchLike {
  return { invoke: vi.fn().mockResolvedValue(result) };
}

const mockModel = {} as ChatAnthropic;

// ---------------------------------------------------------------------------
// Tests — existing behavior (single message, no conversation context)
// ---------------------------------------------------------------------------

describe("createResearcherNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty results for empty messages", async () => {
    const tavily = makeMockTavily();
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState({ messages: [] });

    const result = await node(state);
    expect(result.webSearchResults).toEqual([]);
    expect(result.webSearchResultUrls).toEqual([]);
    expect(tavily.invoke).not.toHaveBeenCalled();
  });

  it("returns search results from Tavily", async () => {
    const tavily = makeMockTavily(
      "Result 1: USADA whereabouts info\n\nResult 2: Filing deadlines",
    );
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResults).toHaveLength(2);
    expect(result.webSearchResults![0]).toContain("USADA whereabouts");
    expect(result.webSearchResults![1]).toContain("Filing deadlines");
  });

  it("prepends domain context to the search query", async () => {
    const tavily = makeMockTavily("results");
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState({ topicDomain: "anti_doping" });

    await node(state);
    const invokeArg = (tavily.invoke as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { query: string };
    expect(invokeArg.query).toContain("USADA anti-doping testing");
  });

  it("uses plain user message when no topicDomain is set", async () => {
    const tavily = makeMockTavily("results");
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState({ topicDomain: undefined });

    await node(state);
    const invokeArg = (tavily.invoke as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { query: string };
    expect(invokeArg.query).toBe("What are USADA whereabouts requirements?");
  });

  it("handles structured Tavily results with URLs", async () => {
    const tavily = makeMockTavily({
      results: [
        {
          url: "https://usopc.org/doc1",
          title: "Selection Procedures",
          content: "result 1 content",
          score: 0.95,
        },
        {
          url: "https://teamusa.org/doc2",
          title: "Athlete Rights",
          content: "result 2 content",
          score: 0.82,
        },
      ],
    });
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResults).toEqual([
      "result 1 content",
      "result 2 content",
    ]);
    expect(result.webSearchResultUrls).toEqual([
      {
        url: "https://usopc.org/doc1",
        title: "Selection Procedures",
        content: "result 1 content",
        score: 0.95,
      },
      {
        url: "https://teamusa.org/doc2",
        title: "Athlete Rights",
        content: "result 2 content",
        score: 0.82,
      },
    ]);
  });

  it("limits results to MAX_SEARCH_RESULTS (5)", async () => {
    const manyResults = Array.from(
      { length: 10 },
      (_, i) => `Result ${i}`,
    ).join("\n\n");
    const tavily = makeMockTavily(manyResults);
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResults!.length).toBeLessThanOrEqual(5);
  });

  it("returns empty results on Tavily error", async () => {
    const tavily: TavilySearchLike = {
      invoke: vi.fn().mockRejectedValue(new Error("API timeout")),
    };
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResults).toEqual([]);
    expect(result.webSearchResultUrls).toEqual([]);
  });

  it("returns empty webSearchResultUrls for string response", async () => {
    const tavily = makeMockTavily(
      "Result 1: USADA whereabouts info\n\nResult 2: Filing deadlines",
    );
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResults!.length).toBe(2);
    expect(result.webSearchResultUrls).toEqual([]);
  });

  it("skips structured results with missing fields", async () => {
    const tavily = makeMockTavily({
      results: [
        {
          url: "https://usopc.org/doc1",
          title: "Good result",
          content: "has all fields",
          score: 0.9,
        },
        { url: "https://usopc.org/doc2", content: "missing title" },
        { title: "missing url", content: "no url field" },
      ],
    });
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResultUrls).toHaveLength(1);
    expect(result.webSearchResultUrls![0]!.url).toBe("https://usopc.org/doc1");
  });

  it("adds domain labels for each domain type", async () => {
    const domains: Array<{
      domain: AgentState["topicDomain"];
      keyword: string;
    }> = [
      { domain: "team_selection", keyword: "team selection" },
      { domain: "dispute_resolution", keyword: "dispute resolution" },
      { domain: "safesport", keyword: "SafeSport" },
      { domain: "eligibility", keyword: "eligibility" },
      { domain: "governance", keyword: "governance" },
      { domain: "athlete_rights", keyword: "athlete rights" },
    ];

    for (const { domain, keyword } of domains) {
      const tavily = makeMockTavily("result");
      const node = createResearcherNode(tavily, mockModel);
      const state = makeState({ topicDomain: domain });

      await node(state);
      const invokeArg = (tavily.invoke as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as { query: string };
      expect(invokeArg.query.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — context-aware query generation (multi-turn conversations)
// ---------------------------------------------------------------------------

describe("createResearcherNode — context-aware queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates LLM-based queries when conversation context exists", async () => {
    const tavilyResult = {
      results: [
        {
          url: "https://usopc.org/governance",
          title: "NGB Governance",
          content: "governance content",
          score: 0.9,
        },
      ],
    };
    const tavily = makeMockTavily(tavilyResult);
    const node = createResearcherNode(tavily, mockModel);

    // Multi-turn conversation: user mentioned a current event, then asks follow-up
    const state = makeState({
      messages: [
        new HumanMessage(
          "USA Judo just removed an AC alternate rep from their board",
        ),
        new AIMessage("I can help with that governance question."),
        new HumanMessage("When do they need to replace the athlete?"),
      ],
      topicDomain: "governance",
    });

    // Mock LLM to return context-aware queries
    const mockResponse = new AIMessage("mock");
    mockInvokeAnthropic.mockResolvedValue(mockResponse);
    mockExtractText.mockReturnValue(
      '["USA Judo board athlete representative replacement deadline", "USA Judo removes AC alternate representative 2026"]',
    );

    const result = await node(state);

    // LLM should have been called
    expect(mockInvokeAnthropic).toHaveBeenCalledOnce();

    // Should have made 2 Tavily calls (one per query)
    expect(tavily.invoke).toHaveBeenCalledTimes(2);

    expect(result.webSearchResults!.length).toBeGreaterThan(0);
  });

  it("skips LLM and uses buildSearchQuery for single-message conversations", async () => {
    const tavily = makeMockTavily("search results text");
    const node = createResearcherNode(tavily, mockModel);
    const state = makeState();

    await node(state);

    // No LLM call — single message means no conversation context
    expect(mockInvokeAnthropic).not.toHaveBeenCalled();

    // Still makes one Tavily call with the simple query
    expect(tavily.invoke).toHaveBeenCalledOnce();
  });

  it("deduplicates results by URL across multiple queries", async () => {
    // Both queries return overlapping results
    const tavily: TavilySearchLike = {
      invoke: vi
        .fn()
        .mockResolvedValueOnce({
          results: [
            {
              url: "https://usopc.org/shared",
              title: "Shared Doc",
              content: "shared content",
              score: 0.95,
            },
            {
              url: "https://usopc.org/unique1",
              title: "Unique 1",
              content: "unique 1 content",
              score: 0.85,
            },
          ],
        })
        .mockResolvedValueOnce({
          results: [
            {
              url: "https://usopc.org/shared",
              title: "Shared Doc",
              content: "shared content",
              score: 0.9,
            },
            {
              url: "https://usopc.org/unique2",
              title: "Unique 2",
              content: "unique 2 content",
              score: 0.8,
            },
          ],
        }),
    };
    const node = createResearcherNode(tavily, mockModel);

    const state = makeState({
      messages: [
        new HumanMessage("USA Judo removed a board member"),
        new AIMessage("I can help with that."),
        new HumanMessage("What are the replacement rules?"),
      ],
      topicDomain: "governance",
    });

    mockInvokeAnthropic.mockResolvedValue(new AIMessage("mock"));
    mockExtractText.mockReturnValue('["query 1", "query 2"]');

    const result = await node(state);

    // 3 unique URLs, not 4 (shared is deduped)
    expect(result.webSearchResultUrls).toHaveLength(3);
    const urls = result.webSearchResultUrls!.map((r) => r.url);
    expect(urls).toContain("https://usopc.org/shared");
    expect(urls).toContain("https://usopc.org/unique1");
    expect(urls).toContain("https://usopc.org/unique2");
  });

  it("sorts deduplicated results by score descending", async () => {
    const tavily: TavilySearchLike = {
      invoke: vi
        .fn()
        .mockResolvedValueOnce({
          results: [
            {
              url: "https://usopc.org/low",
              title: "Low",
              content: "low score",
              score: 0.5,
            },
          ],
        })
        .mockResolvedValueOnce({
          results: [
            {
              url: "https://usopc.org/high",
              title: "High",
              content: "high score",
              score: 0.99,
            },
          ],
        }),
    };
    const node = createResearcherNode(tavily, mockModel);

    const state = makeState({
      messages: [
        new HumanMessage("Some context"),
        new AIMessage("Response"),
        new HumanMessage("Follow-up question"),
      ],
    });

    mockInvokeAnthropic.mockResolvedValue(new AIMessage("mock"));
    mockExtractText.mockReturnValue('["query 1", "query 2"]');

    const result = await node(state);

    // High score should come first
    expect(result.webSearchResultUrls![0]!.score).toBe(0.99);
    expect(result.webSearchResultUrls![1]!.score).toBe(0.5);
  });

  it("falls back to buildSearchQuery when LLM call fails", async () => {
    const tavily = makeMockTavily("fallback results");
    const node = createResearcherNode(tavily, mockModel);

    const state = makeState({
      messages: [
        new HumanMessage("Prior context message"),
        new AIMessage("Response"),
        new HumanMessage("Follow-up question"),
      ],
      topicDomain: "governance",
    });

    // LLM throws an error
    mockInvokeAnthropic.mockRejectedValue(new Error("LLM timeout"));

    const result = await node(state);

    // Should still return results via fallback
    expect(result.webSearchResults!.length).toBeGreaterThan(0);
    expect(tavily.invoke).toHaveBeenCalledOnce();
  });

  it("falls back to buildSearchQuery when LLM returns invalid JSON", async () => {
    const tavily = makeMockTavily("fallback results");
    const node = createResearcherNode(tavily, mockModel);

    const state = makeState({
      messages: [
        new HumanMessage("Some context"),
        new AIMessage("Response"),
        new HumanMessage("Follow-up"),
      ],
      topicDomain: "governance",
    });

    mockInvokeAnthropic.mockResolvedValue(new AIMessage("mock"));
    mockExtractText.mockReturnValue("This is not valid JSON at all");

    const result = await node(state);

    // Should still return results via fallback
    expect(result.webSearchResults!.length).toBeGreaterThan(0);
    expect(tavily.invoke).toHaveBeenCalledOnce();

    // The fallback query should contain domain context
    const invokeArg = (tavily.invoke as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { query: string };
    expect(invokeArg.query).toContain("USOPC NGB governance");
  });
});
