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

vi.mock("../../rag/bm25Search.js", () => ({
  bm25Search: vi.fn().mockResolvedValue([]),
}));

import { createRetrieverNode, type VectorStoreLike } from "./retriever.js";
import { bm25Search } from "../../rag/bm25Search.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.js";

const mockedBm25Search = vi.mocked(bm25Search);

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
    webSearchResultUrls: [],
    retrievalConfidence: 0,
    citations: [],
    answer: undefined,
    escalation: undefined,
    disclaimer: undefined,
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

function makeMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  } as unknown as import("pg").Pool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRetrieverNode", () => {
  let pool: import("pg").Pool;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makeMockPool();
    mockedBm25Search.mockResolvedValue([]);
  });

  it("returns empty results for empty messages", async () => {
    const store = makeMockVectorStore();
    const node = createRetrieverNode(store, pool);
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

    const node = createRetrieverNode(store, pool);
    const state = makeState({
      topicDomain: "team_selection",
      detectedNgbIds: ["usa-swimming"],
    });

    const result = await node(state);
    expect(result.retrievedDocuments!.length).toBeGreaterThanOrEqual(3);
    expect(store.similaritySearchWithScore).toHaveBeenCalledTimes(1);
    expect(store.similaritySearchWithScore).toHaveBeenCalledWith(
      expect.any(String),
      5, // narrowFilterTopK
      expect.objectContaining({ topicDomain: "team_selection" }),
    );
  });

  it("broadens search when narrow returns fewer than 2 results", async () => {
    const store = makeMockVectorStore([
      // Narrow: 1 result (< 2 after RRF)
      [makeSearchResult("narrow-doc", 0.1)],
      // Broad: 3 results
      [
        makeSearchResult("broad-doc-1", 0.15),
        makeSearchResult("broad-doc-2", 0.2),
        makeSearchResult("broad-doc-3", 0.25),
      ],
    ]);

    const node = createRetrieverNode(store, pool);
    const state = makeState({ topicDomain: "governance" });

    const result = await node(state);
    // Should have called vector store twice (narrow + broad)
    expect(store.similaritySearchWithScore).toHaveBeenCalledTimes(2);
    // Should have merged results
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

    const node = createRetrieverNode(store, pool);
    const state = makeState({
      topicDomain: "team_selection",
      detectedNgbIds: ["usa-swimming"],
    });

    await node(state);
    expect(store.similaritySearchWithScore).toHaveBeenCalledTimes(2);
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

    const node = createRetrieverNode(store, pool);
    const state = makeState(); // no topicDomain or detectedNgbIds

    const result = await node(state);
    expect(result.retrievedDocuments!.length).toBeGreaterThanOrEqual(3);
    // Called once for broad search (since no filter -> results.length starts at 0 < 2)
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

    const node = createRetrieverNode(store, pool);
    const state = makeState({ topicDomain: "safesport" });

    const result = await node(state);
    const contents = result.retrievedDocuments!.map((d) => d.content);
    expect(contents).toContain("same content");
    expect(contents).toContain("different content");
    // "same content" should appear only once
    expect(contents.filter((c) => c === "same content")).toHaveLength(1);
  });

  it("computes confidence from fused scores", async () => {
    const store = makeMockVectorStore([
      [
        makeSearchResult("doc1", 0.05),
        makeSearchResult("doc2", 0.1),
        makeSearchResult("doc3", 0.15),
      ],
    ]);

    const node = createRetrieverNode(store, pool);
    const state = makeState({ topicDomain: "anti_doping" });

    const result = await node(state);
    expect(result.retrievalConfidence).toBeGreaterThan(0);
  });

  it("returns zero confidence for no results", async () => {
    const store = makeMockVectorStore([
      [], // narrow returns nothing
      [], // broad returns nothing
    ]);

    const node = createRetrieverNode(store, pool);
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

    const node = createRetrieverNode(store, pool);
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

    const node = createRetrieverNode(store, pool);
    const state = makeState({ topicDomain: "team_selection" });

    const result = await node(state);
    expect(result.retrievalStatus).toBe("success");
  });

  it("returns retrievalStatus success even when vector store errors are caught by fallback", async () => {
    const store: VectorStoreLike = {
      similaritySearchWithScore: vi
        .fn()
        .mockRejectedValue(new Error("DB connection failed")),
    };

    const node = createRetrieverNode(store, pool);
    const state = makeState({ topicDomain: "governance" });

    const result = await node(state);
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

    const node = createRetrieverNode(store, pool);
    const state = makeState({ topicDomain: "team_selection" });

    const result = await node(state);
    const doc = result.retrievedDocuments![0]!;
    expect(doc.metadata.ngbId).toBe("usa-swimming");
    expect(doc.metadata.topicDomain).toBe("team_selection");
    expect(doc.metadata.documentType).toBe("selection_procedures");
    expect(doc.metadata.sourceUrl).toBe("https://example.com");
    expect(doc.metadata.documentTitle).toBe("Swim Selection");
    expect(doc.metadata.sectionTitle).toBe("Criteria");
    expect(doc.metadata.effectiveDate).toBe("2024-01-01");
    expect(doc.metadata.ingestedAt).toBe("2024-06-01");
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

    const node = createRetrieverNode(store, pool);
    const state = makeState({ topicDomain: "governance" });

    const result = await node(state);
    // Both docs should be present (authority boost may reorder)
    const authorityLevels = result.retrievedDocuments!.map(
      (d) => d.metadata.authorityLevel,
    );
    expect(authorityLevels).toContain("law");
    expect(authorityLevels).toContain("usopc_policy_procedure");
  });

  describe("authority level weighting", () => {
    it("ranks higher-authority documents higher when RRF scores are similar", async () => {
      const store = makeMockVectorStore([
        [
          makeSearchResult("educational guidance content", 0.1, {
            documentTitle: "FAQ",
            authorityLevel: "educational_guidance",
          }),
          makeSearchResult("federal law content", 0.12, {
            documentTitle: "Ted Stevens Act",
            authorityLevel: "law",
          }),
        ],
      ]);

      const node = createRetrieverNode(store, pool);
      const state = makeState({ topicDomain: "governance" });

      const result = await node(state);
      expect(result.retrievedDocuments![0]!.metadata.authorityLevel).toBe(
        "law",
      );
    });

    it("escalation intent gives higher authority boost than general intent", async () => {
      // Compare the score gap between law and no-authority docs for each intent.
      // A larger gap means the authority boost is stronger.
      const makeStore = () =>
        makeMockVectorStore([
          [
            makeSearchResult("no-authority doc", 0.1, {}),
            makeSearchResult("high-authority doc", 0.12, {
              authorityLevel: "law",
            }),
          ],
        ]);

      const escalationStore = makeStore();
      const escalationNode = createRetrieverNode(escalationStore, pool);
      const escalationState = makeState({
        topicDomain: "governance",
        queryIntent: "escalation",
      });
      const escalationResult = await escalationNode(escalationState);

      const generalStore = makeStore();
      const generalNode = createRetrieverNode(generalStore, pool);
      const generalState = makeState({
        topicDomain: "governance",
        queryIntent: "general",
      });
      const generalResult = await generalNode(generalState);

      // Compute score gap (law score - no-authority score) for each intent
      const escalationLaw = escalationResult.retrievedDocuments!.find(
        (d) => d.metadata.authorityLevel === "law",
      )!;
      const escalationPlain = escalationResult.retrievedDocuments!.find(
        (d) => !d.metadata.authorityLevel,
      )!;
      const escalationGap = escalationLaw.score - escalationPlain.score;

      const generalLaw = generalResult.retrievedDocuments!.find(
        (d) => d.metadata.authorityLevel === "law",
      )!;
      const generalPlain = generalResult.retrievedDocuments!.find(
        (d) => !d.metadata.authorityLevel,
      )!;
      const generalGap = generalLaw.score - generalPlain.score;

      // Escalation (1.0 multiplier) should produce a larger authority gap than general (0.3)
      expect(escalationGap).toBeGreaterThan(generalGap);
    });

    it("general intent produces minimal authority boost", async () => {
      // Compare score gap between law and no-authority doc for general vs escalation
      const makeStore = () =>
        makeMockVectorStore([
          [
            makeSearchResult("high-authority doc", 0.1, {
              authorityLevel: "law",
            }),
            makeSearchResult("no-authority doc", 0.12, {}),
          ],
        ]);

      const generalStore = makeStore();
      const generalNode = createRetrieverNode(generalStore, pool);
      const generalState = makeState({
        topicDomain: "governance",
        queryIntent: "general",
      });
      const generalResult = await generalNode(generalState);

      const escalationStore = makeStore();
      const escalationNode = createRetrieverNode(escalationStore, pool);
      const escalationState = makeState({
        topicDomain: "governance",
        queryIntent: "escalation",
      });
      const escalationResult = await escalationNode(escalationState);

      const generalLaw = generalResult.retrievedDocuments!.find(
        (d) => d.metadata.authorityLevel === "law",
      )!;
      const generalPlain = generalResult.retrievedDocuments!.find(
        (d) => !d.metadata.authorityLevel,
      )!;
      const generalGap = generalLaw.score - generalPlain.score;

      const escalationLaw = escalationResult.retrievedDocuments!.find(
        (d) => d.metadata.authorityLevel === "law",
      )!;
      const escalationPlain = escalationResult.retrievedDocuments!.find(
        (d) => !d.metadata.authorityLevel,
      )!;
      const escalationGap = escalationLaw.score - escalationPlain.score;

      // General gap should be less than 1/3 of escalation gap (0.3 vs 1.0 multiplier)
      expect(generalGap).toBeLessThan(escalationGap * 0.4);
    });

    it("undefined intent uses default multiplier (0.5)", async () => {
      // Compare authority gap for undefined vs escalation intent
      const makeStore = () =>
        makeMockVectorStore([
          [
            makeSearchResult("law doc", 0.1, {
              authorityLevel: "law",
            }),
            makeSearchResult("plain doc", 0.12, {}),
          ],
        ]);

      const undefinedStore = makeStore();
      const undefinedNode = createRetrieverNode(undefinedStore, pool);
      const undefinedState = makeState({
        topicDomain: "governance",
        queryIntent: undefined,
      });
      const undefinedResult = await undefinedNode(undefinedState);

      const escalationStore = makeStore();
      const escalationNode = createRetrieverNode(escalationStore, pool);
      const escalationState = makeState({
        topicDomain: "governance",
        queryIntent: "escalation",
      });
      const escalationResult = await escalationNode(escalationState);

      const undefinedLaw = undefinedResult.retrievedDocuments!.find(
        (d) => d.metadata.authorityLevel === "law",
      )!;
      const undefinedPlain = undefinedResult.retrievedDocuments!.find(
        (d) => !d.metadata.authorityLevel,
      )!;
      const undefinedGap = undefinedLaw.score - undefinedPlain.score;

      const escalationLaw = escalationResult.retrievedDocuments!.find(
        (d) => d.metadata.authorityLevel === "law",
      )!;
      const escalationPlain = escalationResult.retrievedDocuments!.find(
        (d) => !d.metadata.authorityLevel,
      )!;
      const escalationGap = escalationLaw.score - escalationPlain.score;

      // Default (0.5) should produce exactly half the gap of escalation (1.0)
      expect(undefinedGap / escalationGap).toBeCloseTo(0.5, 1);
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

      const node = createRetrieverNode(store, pool);
      const state = makeState({ topicDomain: "governance" });

      const result = await node(state);
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

    const node = createRetrieverNode(store, pool);
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

    const node = createRetrieverNode(store, pool);
    const state = makeState({ topicDomain: "team_selection" });

    const result = await node(state, { runName: "test-config" });
    expect(result.retrievedDocuments!.length).toBeGreaterThanOrEqual(2);
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

      const node = createRetrieverNode(store, pool);
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

      const mockFn = store.similaritySearchWithScore as ReturnType<
        typeof vi.fn
      >;
      const searchQuery = mockFn.mock.calls[0]![0] as string;
      expect(searchQuery).toContain("alternates");
      expect(searchQuery.toLowerCase()).toContain("swimming");
    });

    it("keeps enriched query concise (not full verbatim history)", async () => {
      const longAssistantResponse = "A".repeat(1000);
      const store = makeMockVectorStore([
        [makeSearchResult("doc1", 0.1), makeSearchResult("doc2", 0.15)],
      ]);

      const node = createRetrieverNode(store, pool);
      const state = makeState({
        messages: [
          new HumanMessage("Initial question about swimming"),
          new AIMessage(longAssistantResponse),
          new HumanMessage("Follow up question"),
        ],
        topicDomain: "team_selection",
      });

      await node(state);

      const mockFn = store.similaritySearchWithScore as ReturnType<
        typeof vi.fn
      >;
      const searchQuery = mockFn.mock.calls[0]![0] as string;
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

      const node = createRetrieverNode(store, pool);
      const state = makeState({
        messages: [new HumanMessage("What are the eligibility requirements?")],
        topicDomain: "eligibility",
      });

      await node(state);

      const mockFn = store.similaritySearchWithScore as ReturnType<
        typeof vi.fn
      >;
      const searchQuery = mockFn.mock.calls[0]![0] as string;
      expect(searchQuery).toContain("eligibility requirements");
    });
  });

  describe("sub-query retrieval", () => {
    it("runs parallel hybrid search per sub-query", async () => {
      const store = makeMockVectorStore([
        [
          makeSearchResult("anti-doping doc", 0.1, {
            topicDomain: "anti_doping",
          }),
        ],
        [
          makeSearchResult("team selection doc", 0.15, {
            topicDomain: "team_selection",
          }),
        ],
      ]);

      const node = createRetrieverNode(store, pool);
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

      const node = createRetrieverNode(store, pool);
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

      const node = createRetrieverNode(store, pool);
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

      expect(store.similaritySearchWithScore).toHaveBeenNthCalledWith(
        1,
        "q1",
        5,
        { topicDomain: "anti_doping", ngbId: "usa-swimming" },
      );

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

      const node = createRetrieverNode(store, pool);
      const state = makeState({
        isComplexQuery: false,
        subQueries: [],
        topicDomain: "team_selection",
      });

      const result = await node(state);
      expect(result.retrievedDocuments!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("hybrid search with BM25", () => {
    it("calls bm25Search in parallel with vector search", async () => {
      const store = makeMockVectorStore([
        [makeSearchResult("vector doc", 0.1, { topicDomain: "governance" })],
      ]);
      mockedBm25Search.mockResolvedValueOnce([
        {
          id: "text-1",
          content: "text doc",
          metadata: { topicDomain: "governance" },
          textRank: 0.8,
        },
      ]);

      const node = createRetrieverNode(store, pool);
      const state = makeState({ topicDomain: "governance" });

      const result = await node(state);
      expect(mockedBm25Search).toHaveBeenCalled();
      expect(result.retrievedDocuments!.length).toBeGreaterThanOrEqual(2);
    });

    it("degrades to vector-only when BM25 returns empty", async () => {
      const store = makeMockVectorStore([
        [
          makeSearchResult("doc1", 0.1),
          makeSearchResult("doc2", 0.2),
          makeSearchResult("doc3", 0.3),
        ],
      ]);
      mockedBm25Search.mockResolvedValue([]);

      const node = createRetrieverNode(store, pool);
      const state = makeState({ topicDomain: "governance" });

      const result = await node(state);
      expect(result.retrievedDocuments!.length).toBeGreaterThanOrEqual(3);
      expect(result.retrievalStatus).toBe("success");
    });

    it("passes SQL filter to bm25Search", async () => {
      const store = makeMockVectorStore([
        [makeSearchResult("doc", 0.1), makeSearchResult("doc2", 0.2)],
      ]);

      const node = createRetrieverNode(store, pool);
      const state = makeState({
        topicDomain: "team_selection",
        detectedNgbIds: ["usa-swimming"],
      });

      await node(state);
      expect(mockedBm25Search).toHaveBeenCalledWith(
        pool,
        expect.objectContaining({
          filter: {
            ngbIds: ["usa-swimming"],
            topicDomain: "team_selection",
          },
        }),
      );
    });

    it("uses queryIntent-based weighting", async () => {
      const store = makeMockVectorStore([
        [makeSearchResult("vector doc", 0.1)],
      ]);
      mockedBm25Search.mockResolvedValueOnce([
        {
          id: "text-1",
          content: "text doc about Section 220522",
          metadata: {},
          textRank: 0.9,
        },
      ]);

      const node = createRetrieverNode(store, pool);
      const state = makeState({
        topicDomain: "governance",
        queryIntent: "factual",
      });

      const result = await node(state);
      expect(result.retrievedDocuments!.length).toBeGreaterThanOrEqual(1);
    });

    it("calls bm25Search for sub-queries too", async () => {
      const store = makeMockVectorStore([
        [makeSearchResult("doc1", 0.1)],
        [makeSearchResult("doc2", 0.15)],
      ]);
      mockedBm25Search.mockResolvedValue([]);

      const node = createRetrieverNode(store, pool);
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
            intent: "procedural",
            ngbIds: [],
          },
        ],
      });

      await node(state);
      expect(mockedBm25Search).toHaveBeenCalledTimes(2);
    });
  });
});
