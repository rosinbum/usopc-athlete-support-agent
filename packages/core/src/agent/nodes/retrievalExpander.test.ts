import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({
    invoke: vi.fn(),
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
  };
});

import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { createRetrievalExpanderNode } from "./retrievalExpander.js";
import { setAnthropicApiKey } from "../../config/index.js";
import type { VectorStoreLike } from "./retriever.js";
import type { AgentState } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("How are athletes selected for the Olympics?")],
    topicDomain: "team_selection",
    detectedNgbIds: [],
    queryIntent: undefined,
    retrievedDocuments: [
      {
        content: "existing doc content",
        metadata: {
          documentTitle: "Existing Doc",
          ngbId: undefined,
          topicDomain: "team_selection",
          documentType: undefined,
          sourceUrl: undefined,
          sectionTitle: undefined,
          effectiveDate: undefined,
          ingestedAt: undefined,
          authorityLevel: undefined,
        },
        score: 0.4,
      },
    ],
    webSearchResults: [],
    webSearchResultUrls: [],
    retrievalConfidence: 0.3,
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

type SearchResult = [
  { pageContent: string; metadata: Record<string, unknown> },
  number,
];

function makeSearchResult(
  content: string,
  score: number,
  metadata: Record<string, unknown> = {},
): SearchResult {
  return [{ pageContent: content, metadata }, score];
}

function makeMockVectorStore(
  responses: SearchResult[][] = [],
): VectorStoreLike {
  const mock = {
    similaritySearchWithScore: vi.fn(),
  };
  for (const response of responses) {
    mock.similaritySearchWithScore.mockResolvedValueOnce(response);
  }
  return mock;
}

function setupMockModel(responseText: string): void {
  const MockChatAnthropic = vi.mocked(ChatAnthropic);
  MockChatAnthropic.mockImplementation(
    () =>
      ({
        invoke: vi.fn().mockResolvedValue(new AIMessage(responseText)),
      }) as unknown as ChatAnthropic,
  );
}

function setupFailingModel(error: Error): void {
  const MockChatAnthropic = vi.mocked(ChatAnthropic);
  MockChatAnthropic.mockImplementation(
    () =>
      ({
        invoke: vi.fn().mockRejectedValue(error),
      }) as unknown as ChatAnthropic,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRetrievalExpanderNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAnthropicApiKey("test-key");
  });

  it("generates reformulated queries and merges results", async () => {
    const reformulated = [
      "Olympic team qualification standards",
      "athlete selection procedures",
      "how are Olympic team members chosen",
    ];
    setupMockModel(JSON.stringify(reformulated));

    const store = makeMockVectorStore([
      // Results for query 1
      [
        makeSearchResult("new doc 1", 0.15, {
          documentTitle: "Selection Standards",
        }),
      ],
      // Results for query 2
      [
        makeSearchResult("new doc 2", 0.2, {
          documentTitle: "Selection Procedures",
        }),
      ],
      // Results for query 3
      [makeSearchResult("new doc 3", 0.25, { documentTitle: "Team Choosing" })],
    ]);

    const node = createRetrievalExpanderNode(store);
    const result = await node(makeState());

    expect(result.expansionAttempted).toBe(true);
    expect(result.reformulatedQueries).toEqual(reformulated);
    // 1 existing + 3 new = 4 merged docs
    expect(result.retrievedDocuments).toHaveLength(4);
    expect(result.retrievalConfidence).toBeGreaterThan(0);
    expect(store.similaritySearchWithScore).toHaveBeenCalledTimes(3);
  });

  it("deduplicates overlapping documents", async () => {
    setupMockModel(JSON.stringify(["query 1", "query 2", "query 3"]));

    const store = makeMockVectorStore([
      // Query 1 returns a doc with same content as existing
      [makeSearchResult("existing doc content", 0.15)],
      // Query 2 returns a unique doc
      [makeSearchResult("unique new content", 0.2)],
      // Query 3 returns same as query 2
      [makeSearchResult("unique new content", 0.22)],
    ]);

    const node = createRetrievalExpanderNode(store);
    const result = await node(makeState());

    // 1 existing + 1 unique new = 2 (duplicates removed)
    expect(result.retrievedDocuments).toHaveLength(2);
    const contents = result.retrievedDocuments!.map((d) => d.content);
    expect(contents).toContain("existing doc content");
    expect(contents).toContain("unique new content");
  });

  it("recomputes confidence on merged results", async () => {
    setupMockModel(
      JSON.stringify(["better query 1", "better query 2", "better query 3"]),
    );

    // Return high-quality results (low distance scores)
    const store = makeMockVectorStore([
      [makeSearchResult("high quality 1", 0.05)],
      [makeSearchResult("high quality 2", 0.08)],
      [makeSearchResult("high quality 3", 0.1)],
    ]);

    const state = makeState({ retrievalConfidence: 0.3 });
    const node = createRetrievalExpanderNode(store);
    const result = await node(state);

    // New confidence should reflect the improved results
    expect(result.retrievalConfidence).toBeGreaterThan(0);
    expect(result.expansionAttempted).toBe(true);
  });

  it("returns expansionAttempted: true on success", async () => {
    setupMockModel(JSON.stringify(["q1", "q2", "q3"]));
    const store = makeMockVectorStore([[], [], []]);

    const node = createRetrievalExpanderNode(store);
    const result = await node(makeState());

    expect(result.expansionAttempted).toBe(true);
  });

  it("fail-open: returns expansionAttempted true when Haiku fails", async () => {
    setupFailingModel(new Error("Anthropic API error"));
    const store = makeMockVectorStore();

    const node = createRetrievalExpanderNode(store);
    const result = await node(makeState());

    expect(result.expansionAttempted).toBe(true);
    expect(result.retrievedDocuments).toBeUndefined();
    expect(store.similaritySearchWithScore).not.toHaveBeenCalled();
  });

  it("fail-open: returns expansionAttempted true when vector search fails", async () => {
    setupMockModel(JSON.stringify(["q1", "q2", "q3"]));

    const store: VectorStoreLike = {
      similaritySearchWithScore: vi
        .fn()
        .mockRejectedValue(new Error("DB connection failed")),
    };

    const node = createRetrievalExpanderNode(store);
    const result = await node(makeState());

    // vectorStoreSearch uses circuit breaker fallback, returns []
    // So this should succeed with no new docs
    expect(result.expansionAttempted).toBe(true);
  });

  it("handles empty state gracefully (no user message)", async () => {
    const store = makeMockVectorStore();
    const node = createRetrievalExpanderNode(store);
    const state = makeState({ messages: [] });

    const result = await node(state);

    expect(result.expansionAttempted).toBe(true);
    expect(store.similaritySearchWithScore).not.toHaveBeenCalled();
  });

  it("handles unparseable model response gracefully", async () => {
    setupMockModel("This is not valid JSON");
    const store = makeMockVectorStore();

    const node = createRetrievalExpanderNode(store);
    const result = await node(makeState());

    expect(result.expansionAttempted).toBe(true);
    expect(result.reformulatedQueries).toEqual([]);
    expect(store.similaritySearchWithScore).not.toHaveBeenCalled();
  });

  it("passes correct filter to vector store searches", async () => {
    setupMockModel(JSON.stringify(["q1", "q2", "q3"]));
    const store = makeMockVectorStore([[], [], []]);

    const node = createRetrievalExpanderNode(store);
    const state = makeState({
      topicDomain: "governance",
      detectedNgbIds: ["usa-swimming"],
    });

    await node(state);

    expect(store.similaritySearchWithScore).toHaveBeenCalledWith("q1", 5, {
      ngbId: "usa-swimming",
      topicDomain: "governance",
    });
  });

  it("maps metadata fields correctly on new documents", async () => {
    setupMockModel(JSON.stringify(["q1", "q2", "q3"]));
    const store = makeMockVectorStore([
      [
        makeSearchResult("new content", 0.1, {
          ngbId: "usa-swimming",
          topicDomain: "team_selection",
          documentType: "selection_procedures",
          sourceUrl: "https://example.com",
          documentTitle: "Selection Doc",
          sectionTitle: "Criteria",
          effectiveDate: "2024-01-01",
          ingestedAt: "2024-06-01",
          authorityLevel: "ngb_policy_procedure",
        }),
      ],
      [],
      [],
    ]);

    const node = createRetrievalExpanderNode(store);
    const result = await node(makeState());

    const newDoc = result.retrievedDocuments!.find(
      (d) => d.content === "new content",
    );
    expect(newDoc).toBeDefined();
    expect(newDoc!.metadata.ngbId).toBe("usa-swimming");
    expect(newDoc!.metadata.topicDomain).toBe("team_selection");
    expect(newDoc!.metadata.documentType).toBe("selection_procedures");
    expect(newDoc!.metadata.sourceUrl).toBe("https://example.com");
    expect(newDoc!.metadata.documentTitle).toBe("Selection Doc");
    expect(newDoc!.metadata.authorityLevel).toBe("ngb_policy_procedure");
    expect(newDoc!.score).toBe(0.1);
  });
});
