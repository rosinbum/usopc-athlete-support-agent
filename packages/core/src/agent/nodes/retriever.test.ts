import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { createRetrieverNode, type VectorStoreLike } from "./retriever.js";
import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("How are athletes selected for the Olympics?")],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRetrieverNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty results for empty messages", async () => {
    const store = makeMockVectorStore();
    const node = createRetrieverNode(store);
    const state = makeState({ messages: [] });

    const result = await node(state);
    expect(result.retrievedDocuments).toEqual([]);
    expect(result.retrievalConfidence).toBe(0);
  });

  it("runs narrow search when filters are available", async () => {
    const store = makeMockVectorStore([
      // Narrow search returns 3 results (>= 2, so no broadening)
      [
        makeSearchResult("doc1", 0.1, { topicDomain: "team_selection" }),
        makeSearchResult("doc2", 0.2, { topicDomain: "team_selection" }),
        makeSearchResult("doc3", 0.3, { topicDomain: "team_selection" }),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({
      topicDomain: "team_selection",
      detectedNgbIds: ["usa_swimming"],
    });

    const result = await node(state);
    expect(result.retrievedDocuments).toHaveLength(3);
    expect(store.similaritySearchWithScore).toHaveBeenCalledTimes(1);
    // Should pass filter with ngbId and topicDomain
    expect(store.similaritySearchWithScore).toHaveBeenCalledWith(
      expect.any(String),
      5, // narrowFilterTopK
      expect.objectContaining({ topicDomain: "team_selection" }),
    );
  });

  it("broadens search when narrow returns fewer than 2 results", async () => {
    const store = makeMockVectorStore([
      // Narrow: 1 result (< 2)
      [makeSearchResult("narrow-doc", 0.1)],
      // Broad: 3 results
      [
        makeSearchResult("broad-doc-1", 0.15),
        makeSearchResult("broad-doc-2", 0.2),
        makeSearchResult("broad-doc-3", 0.25),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "governance" });

    const result = await node(state);
    expect(store.similaritySearchWithScore).toHaveBeenCalledTimes(2);
    // Broad search has no filter
    expect(store.similaritySearchWithScore).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      10, // broadenFilterTopK
    );
    // Should have merged results (1 narrow + 3 broad, deduped)
    expect(result.retrievedDocuments!.length).toBeGreaterThanOrEqual(3);
  });

  it("skips narrow search and goes directly to broad when no filters", async () => {
    const store = makeMockVectorStore([
      // No narrow search (filter is undefined), goes straight to broad
      [
        makeSearchResult("doc1", 0.1),
        makeSearchResult("doc2", 0.2),
        makeSearchResult("doc3", 0.3),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState(); // no topicDomain or detectedNgbIds

    const result = await node(state);
    expect(result.retrievedDocuments).toHaveLength(3);
    // Called once for broad search (since no filter → results.length starts at 0 < 2)
    expect(store.similaritySearchWithScore).toHaveBeenCalledTimes(1);
  });

  it("deduplicates documents across narrow and broad results", async () => {
    const store = makeMockVectorStore([
      [makeSearchResult("same content", 0.1)],
      [
        makeSearchResult("same content", 0.15),
        makeSearchResult("different content", 0.2),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "safesport" });

    const result = await node(state);
    const contents = result.retrievedDocuments!.map((d) => d.content);
    expect(contents).toEqual(["same content", "different content"]);
  });

  it("computes confidence from similarity scores", async () => {
    // Scores close to 0 = high similarity → high confidence
    const store = makeMockVectorStore([
      [
        makeSearchResult("doc1", 0.05),
        makeSearchResult("doc2", 0.1),
        makeSearchResult("doc3", 0.15),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "anti_doping" });

    const result = await node(state);
    expect(result.retrievalConfidence).toBeGreaterThan(0.5);
  });

  it("returns zero confidence for no results", async () => {
    const store = makeMockVectorStore([
      [], // narrow returns nothing
      [], // broad returns nothing
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "eligibility" });

    const result = await node(state);
    expect(result.retrievedDocuments).toEqual([]);
    expect(result.retrievalConfidence).toBe(0);
  });

  it("returns empty results on vector store error", async () => {
    const store: VectorStoreLike = {
      similaritySearchWithScore: vi
        .fn()
        .mockRejectedValue(new Error("DB connection failed")),
    };

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "governance" });

    const result = await node(state);
    expect(result.retrievedDocuments).toEqual([]);
    expect(result.retrievalConfidence).toBe(0);
  });

  it("maps metadata fields correctly", async () => {
    const store = makeMockVectorStore([
      [
        makeSearchResult("content", 0.1, {
          ngbId: "usa_swimming",
          topicDomain: "team_selection",
          documentType: "selection_procedures",
          sourceUrl: "https://example.com",
          documentTitle: "Swim Selection",
          sectionTitle: "Criteria",
          effectiveDate: "2024-01-01",
          ingestedAt: "2024-06-01",
        }),
        makeSearchResult("content2", 0.2),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "team_selection" });

    const result = await node(state);
    const doc = result.retrievedDocuments![0];
    expect(doc.metadata.ngbId).toBe("usa_swimming");
    expect(doc.metadata.topicDomain).toBe("team_selection");
    expect(doc.metadata.documentType).toBe("selection_procedures");
    expect(doc.metadata.sourceUrl).toBe("https://example.com");
    expect(doc.metadata.documentTitle).toBe("Swim Selection");
    expect(doc.metadata.sectionTitle).toBe("Criteria");
    expect(doc.metadata.effectiveDate).toBe("2024-01-01");
    expect(doc.metadata.ingestedAt).toBe("2024-06-01");
    expect(doc.score).toBe(0.1);
  });

  it("uses $in filter for multiple NGB IDs", async () => {
    const store = makeMockVectorStore([
      [
        makeSearchResult("doc1", 0.1),
        makeSearchResult("doc2", 0.15),
        makeSearchResult("doc3", 0.2),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({
      detectedNgbIds: ["usa_swimming", "usa_track_field"],
      topicDomain: "team_selection",
    });

    await node(state);
    expect(store.similaritySearchWithScore).toHaveBeenCalledWith(
      expect.any(String),
      5,
      expect.objectContaining({
        ngbId: { $in: ["usa_swimming", "usa_track_field"] },
      }),
    );
  });
});
