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

import { createResearcherNode, type TavilySearchLike } from "./researcher.js";
import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.js";

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createResearcherNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty results for empty messages", async () => {
    const tavily = makeMockTavily();
    const node = createResearcherNode(tavily);
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
    const node = createResearcherNode(tavily);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResults).toHaveLength(2);
    expect(result.webSearchResults![0]).toContain("USADA whereabouts");
    expect(result.webSearchResults![1]).toContain("Filing deadlines");
  });

  it("prepends domain context to the search query", async () => {
    const tavily = makeMockTavily("results");
    const node = createResearcherNode(tavily);
    const state = makeState({ topicDomain: "anti_doping" });

    await node(state);
    const invokeArg = (tavily.invoke as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { query: string };
    expect(invokeArg.query).toContain("USADA anti-doping testing");
  });

  it("uses plain user message when no topicDomain is set", async () => {
    const tavily = makeMockTavily("results");
    const node = createResearcherNode(tavily);
    const state = makeState({ topicDomain: undefined });

    await node(state);
    const invokeArg = (tavily.invoke as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { query: string };
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
    const node = createResearcherNode(tavily);
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
    const node = createResearcherNode(tavily);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResults!.length).toBeLessThanOrEqual(5);
  });

  it("returns empty results on Tavily error", async () => {
    const tavily: TavilySearchLike = {
      invoke: vi.fn().mockRejectedValue(new Error("API timeout")),
    };
    const node = createResearcherNode(tavily);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResults).toEqual([]);
    expect(result.webSearchResultUrls).toEqual([]);
  });

  it("returns empty webSearchResultUrls for string response", async () => {
    const tavily = makeMockTavily(
      "Result 1: USADA whereabouts info\n\nResult 2: Filing deadlines",
    );
    const node = createResearcherNode(tavily);
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
    const node = createResearcherNode(tavily);
    const state = makeState();

    const result = await node(state);
    expect(result.webSearchResultUrls).toHaveLength(1);
    expect(result.webSearchResultUrls![0].url).toBe("https://usopc.org/doc1");
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
      const node = createResearcherNode(tavily);
      const state = makeState({ topicDomain: domain });

      await node(state);
      const invokeArg = (tavily.invoke as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { query: string };
      expect(invokeArg.query.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });
});
