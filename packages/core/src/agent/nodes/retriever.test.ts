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
    getOptionalSecretValue: vi.fn().mockReturnValue("5"),
  };
});

import { createRetrieverNode, type VectorStoreLike } from "./retriever.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
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
    conversationSummary: undefined,
    userSport: undefined,
    needsClarification: false,
    clarificationQuestion: undefined,
    escalationReason: undefined,
    retrievalStatus: "success",
    emotionalState: "neutral",
    qualityCheckResult: undefined,
    qualityRetryCount: 0,
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
      detectedNgbIds: ["usa-swimming"],
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
    // Broad search has no NGB broad filter (no detectedNgbIds)
    expect(store.similaritySearchWithScore).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      10, // broadenFilterTopK
      undefined,
    );
    // Should have merged results (1 narrow + 3 broad, deduped)
    expect(result.retrievedDocuments!.length).toBeGreaterThanOrEqual(3);
  });

  it("broad search uses $or filter for NGB + universal docs", async () => {
    const store = makeMockVectorStore([
      // Narrow: 1 result (< 2) triggers broadening
      [makeSearchResult("narrow-doc", 0.1)],
      // Broad: returns results
      [
        makeSearchResult("broad-doc-1", 0.15),
        makeSearchResult("broad-doc-2", 0.2),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({
      topicDomain: "team_selection",
      detectedNgbIds: ["usa-swimming"],
    });

    await node(state);
    expect(store.similaritySearchWithScore).toHaveBeenCalledTimes(2);
    // Broad search should use $or filter: NGB match OR universal (ngbId: null)
    expect(store.similaritySearchWithScore).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      10,
      {
        $or: [{ ngbId: "usa-swimming" }, { ngbId: null }],
      },
    );
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

  it("returns retrievalStatus success on successful retrieval", async () => {
    const store = makeMockVectorStore([
      [
        makeSearchResult("doc1", 0.1, { topicDomain: "team_selection" }),
        makeSearchResult("doc2", 0.2, { topicDomain: "team_selection" }),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "team_selection" });

    const result = await node(state);
    expect(result.retrievalStatus).toBe("success");
  });

  it("returns retrievalStatus success even when vector store errors are caught by fallback", async () => {
    // The vectorStoreSearch fallback swallows errors and returns [],
    // so the retriever's catch block is NOT reached in normal operation.
    // The retriever returns "success" because the circuit breaker fallback
    // handled the error gracefully.
    const store: VectorStoreLike = {
      similaritySearchWithScore: vi
        .fn()
        .mockRejectedValue(new Error("DB connection failed")),
    };

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "governance" });

    const result = await node(state);
    // Fallback silently returns [] — no error propagated to catch block
    expect(result.retrievalStatus).toBe("success");
  });

  it("maps metadata fields correctly", async () => {
    const store = makeMockVectorStore([
      [
        makeSearchResult("content", 0.1, {
          ngbId: "usa-swimming",
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
    expect(doc.metadata.ngbId).toBe("usa-swimming");
    expect(doc.metadata.topicDomain).toBe("team_selection");
    expect(doc.metadata.documentType).toBe("selection_procedures");
    expect(doc.metadata.sourceUrl).toBe("https://example.com");
    expect(doc.metadata.documentTitle).toBe("Swim Selection");
    expect(doc.metadata.sectionTitle).toBe("Criteria");
    expect(doc.metadata.effectiveDate).toBe("2024-01-01");
    expect(doc.metadata.ingestedAt).toBe("2024-06-01");
    expect(doc.score).toBe(0.1);
  });

  it("maps authorityLevel from vector store metadata", async () => {
    const store = makeMockVectorStore([
      [
        makeSearchResult("federal law content", 0.1, {
          documentTitle: "Ted Stevens Act",
          authorityLevel: "law",
        }),
        makeSearchResult("policy content", 0.15, {
          documentTitle: "USOPC Policy",
          authorityLevel: "usopc_policy_procedure",
        }),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "governance" });

    const result = await node(state);
    expect(result.retrievedDocuments![0].metadata.authorityLevel).toBe("law");
    expect(result.retrievedDocuments![1].metadata.authorityLevel).toBe(
      "usopc_policy_procedure",
    );
  });

  describe("authority level weighting", () => {
    it("ranks higher-authority documents higher when similarity scores are similar", async () => {
      // Both docs have similar scores (0.10 vs 0.12) but different authority levels
      const store = makeMockVectorStore([
        [
          makeSearchResult("educational guidance content", 0.1, {
            documentTitle: "FAQ",
            authorityLevel: "educational_guidance", // lowest authority
          }),
          makeSearchResult("federal law content", 0.12, {
            documentTitle: "Ted Stevens Act",
            authorityLevel: "law", // highest authority
          }),
        ],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({ topicDomain: "governance" });

      const result = await node(state);
      // Law should rank first despite slightly worse similarity score
      expect(result.retrievedDocuments![0].metadata.authorityLevel).toBe("law");
      expect(result.retrievedDocuments![1].metadata.authorityLevel).toBe(
        "educational_guidance",
      );
    });

    it("preserves similarity-based ranking when score difference is significant", async () => {
      // Significant score difference (0.1 vs 0.5) should keep similarity-based order
      const store = makeMockVectorStore([
        [
          makeSearchResult("educational content with great match", 0.1, {
            documentTitle: "Athlete Guide",
            authorityLevel: "educational_guidance",
          }),
          makeSearchResult("law content with poor match", 0.5, {
            documentTitle: "Ted Stevens Act",
            authorityLevel: "law",
          }),
        ],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({ topicDomain: "governance" });

      const result = await node(state);
      // Educational guide should still rank first due to much better similarity
      expect(result.retrievedDocuments![0].metadata.authorityLevel).toBe(
        "educational_guidance",
      );
      expect(result.retrievedDocuments![1].metadata.authorityLevel).toBe("law");
    });

    it("handles documents without authority level gracefully", async () => {
      const store = makeMockVectorStore([
        [
          makeSearchResult("doc without authority", 0.1, {
            documentTitle: "Legacy Doc",
          }),
          makeSearchResult("doc with authority", 0.12, {
            documentTitle: "USOPC Policy",
            authorityLevel: "usopc_policy_procedure",
          }),
        ],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({ topicDomain: "governance" });

      const result = await node(state);
      // Should not crash and should return both documents
      expect(result.retrievedDocuments).toHaveLength(2);
    });
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
      detectedNgbIds: ["usa-swimming", "usa-track-field"],
      topicDomain: "team_selection",
    });

    await node(state);
    expect(store.similaritySearchWithScore).toHaveBeenCalledWith(
      expect.any(String),
      5,
      expect.objectContaining({
        ngbId: { $in: ["usa-swimming", "usa-track-field"] },
      }),
    );
  });

  it("accepts an optional RunnableConfig as second argument", async () => {
    const store = makeMockVectorStore([
      [
        makeSearchResult("doc1", 0.1, { topicDomain: "team_selection" }),
        makeSearchResult("doc2", 0.2, { topicDomain: "team_selection" }),
      ],
    ]);

    const node = createRetrieverNode(store);
    const state = makeState({ topicDomain: "team_selection" });

    const result = await node(state, { runName: "test-config" });
    expect(result.retrievedDocuments).toHaveLength(2);
    expect(result.retrievalConfidence).toBeGreaterThan(0);
  });

  describe("conversation context", () => {
    it("enriches search query with context from prior messages", async () => {
      const store = makeMockVectorStore([
        [
          makeSearchResult("Alternates selection procedures", 0.1),
          makeSearchResult("Team selection doc", 0.15),
        ],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({
        messages: [
          new HumanMessage(
            "What are the team selection criteria for swimming?",
          ),
          new AIMessage(
            "USA Swimming selects athletes based on time standards.",
          ),
          new HumanMessage("What about alternates?"),
        ],
        topicDomain: "team_selection",
        detectedNgbIds: ["usa-swimming"],
      });

      await node(state);

      // The query should be enriched with context
      const mockFn = store.similaritySearchWithScore as ReturnType<
        typeof vi.fn
      >;
      const searchQuery = mockFn.mock.calls[0][0] as string;
      // Query should include the current message
      expect(searchQuery).toContain("alternates");
      // Query should include relevant context
      expect(searchQuery.toLowerCase()).toContain("swimming");
    });

    it("keeps enriched query concise (not full verbatim history)", async () => {
      const longAssistantResponse = "A".repeat(1000);
      const store = makeMockVectorStore([
        [makeSearchResult("doc1", 0.1), makeSearchResult("doc2", 0.15)],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({
        messages: [
          new HumanMessage("Initial question about swimming"),
          new AIMessage(longAssistantResponse),
          new HumanMessage("Follow up question"),
        ],
        topicDomain: "team_selection",
      });

      await node(state);

      // Query should be enriched but not include the full verbatim history
      const mockFn = store.similaritySearchWithScore as ReturnType<
        typeof vi.fn
      >;
      const searchQuery = mockFn.mock.calls[0][0] as string;
      expect(searchQuery.length).toBeLessThan(longAssistantResponse.length);
    });

    it("works correctly with single message (no prior context)", async () => {
      const store = makeMockVectorStore([
        [
          makeSearchResult("doc1", 0.1),
          makeSearchResult("doc2", 0.15),
          makeSearchResult("doc3", 0.2),
        ],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({
        messages: [new HumanMessage("What are the eligibility requirements?")],
        topicDomain: "eligibility",
      });

      await node(state);

      // Should use the single message as the query
      const mockFn = store.similaritySearchWithScore as ReturnType<
        typeof vi.fn
      >;
      const searchQuery = mockFn.mock.calls[0][0] as string;
      expect(searchQuery).toContain("eligibility requirements");
    });
  });

  describe("sub-query retrieval", () => {
    it("runs parallel search per sub-query", async () => {
      const store = makeMockVectorStore([
        // First sub-query results
        [
          makeSearchResult("anti-doping doc", 0.1, {
            topicDomain: "anti_doping",
          }),
        ],
        // Second sub-query results
        [
          makeSearchResult("team selection doc", 0.15, {
            topicDomain: "team_selection",
          }),
        ],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({
        isComplexQuery: true,
        subQueries: [
          {
            query: "anti-doping rules for team selection",
            domain: "anti_doping",
            intent: "factual",
            ngbIds: [],
          },
          {
            query: "team selection disqualification criteria",
            domain: "team_selection",
            intent: "procedural",
            ngbIds: [],
          },
        ],
      });

      const result = await node(state);
      expect(store.similaritySearchWithScore).toHaveBeenCalledTimes(2);
      expect(result.retrievedDocuments!.length).toBe(2);
      expect(result.retrievalStatus).toBe("success");
    });

    it("deduplicates across sub-queries", async () => {
      const store = makeMockVectorStore([
        [
          makeSearchResult("shared doc about doping and selection", 0.1, {
            topicDomain: "anti_doping",
          }),
          makeSearchResult("anti-doping specific doc", 0.15),
        ],
        [
          makeSearchResult("shared doc about doping and selection", 0.12, {
            topicDomain: "team_selection",
          }),
          makeSearchResult("team selection specific doc", 0.18),
        ],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({
        isComplexQuery: true,
        subQueries: [
          {
            query: "q1",
            domain: "anti_doping",
            intent: "factual",
            ngbIds: [],
          },
          {
            query: "q2",
            domain: "team_selection",
            intent: "factual",
            ngbIds: [],
          },
        ],
      });

      const result = await node(state);
      const contents = result.retrievedDocuments!.map((d) => d.content);
      // "shared doc" should appear only once
      expect(
        contents.filter((c) => c === "shared doc about doping and selection")
          .length,
      ).toBe(1);
    });

    it("constructs filter per sub-query with domain and ngbIds", async () => {
      const store = makeMockVectorStore([
        [makeSearchResult("doc1", 0.1)],
        [makeSearchResult("doc2", 0.15)],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({
        isComplexQuery: true,
        subQueries: [
          {
            query: "q1",
            domain: "anti_doping",
            intent: "factual",
            ngbIds: ["usa-swimming"],
          },
          {
            query: "q2",
            domain: "team_selection",
            intent: "procedural",
            ngbIds: [],
          },
        ],
      });

      await node(state);

      // First sub-query: domain + NGB filter
      expect(store.similaritySearchWithScore).toHaveBeenNthCalledWith(
        1,
        "q1",
        5,
        { topicDomain: "anti_doping", ngbId: "usa-swimming" },
      );

      // Second sub-query: domain-only filter
      expect(store.similaritySearchWithScore).toHaveBeenNthCalledWith(
        2,
        "q2",
        5,
        { topicDomain: "team_selection" },
      );
    });

    it("falls back to normal retrieval when subQueries is empty", async () => {
      const store = makeMockVectorStore([
        [
          makeSearchResult("doc1", 0.1, { topicDomain: "team_selection" }),
          makeSearchResult("doc2", 0.2, { topicDomain: "team_selection" }),
        ],
      ]);

      const node = createRetrieverNode(store);
      const state = makeState({
        isComplexQuery: false,
        subQueries: [],
        topicDomain: "team_selection",
      });

      const result = await node(state);
      expect(result.retrievedDocuments).toHaveLength(2);
    });
  });
});
