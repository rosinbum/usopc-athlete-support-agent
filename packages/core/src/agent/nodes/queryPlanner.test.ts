import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
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

import { queryPlannerNode, parseQueryPlannerResponse } from "./queryPlanner.js";
import { HumanMessage } from "@langchain/core/messages";
import { CircuitBreakerError } from "@usopc/shared";
import type { AgentState } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [
      new HumanMessage(
        "How do anti-doping rules interact with team selection?",
      ),
    ],
    topicDomain: "anti_doping",
    detectedNgbIds: [],
    queryIntent: "factual",
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

function plannerResponse(data: Record<string, unknown>): {
  content: string;
} {
  return { content: JSON.stringify(data) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("queryPlannerNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("decomposes a complex multi-domain query", async () => {
    mockInvoke.mockResolvedValueOnce(
      plannerResponse({
        isComplex: true,
        subQueries: [
          {
            query: "What anti-doping rules apply to team selection?",
            domain: "anti_doping",
            intent: "factual",
            ngbIds: [],
          },
          {
            query:
              "How does team selection work and what disqualifies athletes?",
            domain: "team_selection",
            intent: "procedural",
            ngbIds: [],
          },
        ],
      }),
    );

    const state = makeState();
    const result = await queryPlannerNode(state);

    expect(result.isComplexQuery).toBe(true);
    expect(result.subQueries).toHaveLength(2);
    expect(result.subQueries![0].domain).toBe("anti_doping");
    expect(result.subQueries![1].domain).toBe("team_selection");
  });

  it("passes through simple queries", async () => {
    mockInvoke.mockResolvedValueOnce(
      plannerResponse({
        isComplex: false,
        subQueries: [],
      }),
    );

    const state = makeState({
      messages: [new HumanMessage("What are the team selection criteria?")],
      topicDomain: "team_selection",
    });
    const result = await queryPlannerNode(state);

    expect(result.isComplexQuery).toBe(false);
    expect(result.subQueries).toEqual([]);
  });

  it("fails open on API error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("API rate limited"));

    const state = makeState();
    const result = await queryPlannerNode(state);

    expect(result.isComplexQuery).toBe(false);
    expect(result.subQueries).toEqual([]);
  });

  it("fails open on circuit breaker error", async () => {
    mockInvoke.mockRejectedValueOnce(new CircuitBreakerError("anthropic"));

    const state = makeState();
    const result = await queryPlannerNode(state);

    expect(result.isComplexQuery).toBe(false);
    expect(result.subQueries).toEqual([]);
  });

  it("returns pass-through for empty messages", async () => {
    const state = makeState({ messages: [] });
    const result = await queryPlannerNode(state);

    expect(result.isComplexQuery).toBe(false);
    expect(result.subQueries).toEqual([]);
  });

  it("handles markdown code fences around JSON", async () => {
    const json = JSON.stringify({
      isComplex: true,
      subQueries: [
        {
          query: "Anti-doping question",
          domain: "anti_doping",
          intent: "factual",
          ngbIds: [],
        },
        {
          query: "Team selection question",
          domain: "team_selection",
          intent: "procedural",
          ngbIds: [],
        },
      ],
    });
    mockInvoke.mockResolvedValueOnce({
      content: "```json\n" + json + "\n```",
    });

    const state = makeState();
    const result = await queryPlannerNode(state);

    expect(result.isComplexQuery).toBe(true);
    expect(result.subQueries).toHaveLength(2);
  });

  it("handles array content from Claude response", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isComplex: false,
            subQueries: [],
          }),
        },
      ],
    });

    const state = makeState();
    const result = await queryPlannerNode(state);

    expect(result.isComplexQuery).toBe(false);
  });

  it("caps sub-queries at 4", async () => {
    mockInvoke.mockResolvedValueOnce(
      plannerResponse({
        isComplex: true,
        subQueries: [
          { query: "q1", domain: "anti_doping", intent: "factual", ngbIds: [] },
          {
            query: "q2",
            domain: "team_selection",
            intent: "factual",
            ngbIds: [],
          },
          {
            query: "q3",
            domain: "eligibility",
            intent: "factual",
            ngbIds: [],
          },
          { query: "q4", domain: "governance", intent: "factual", ngbIds: [] },
          { query: "q5", domain: "safesport", intent: "factual", ngbIds: [] },
        ],
      }),
    );

    const state = makeState();
    const result = await queryPlannerNode(state);

    expect(result.subQueries!.length).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// parseQueryPlannerResponse
// ---------------------------------------------------------------------------

describe("parseQueryPlannerResponse", () => {
  it("parses valid complex response", () => {
    const { output, warnings } = parseQueryPlannerResponse(
      JSON.stringify({
        isComplex: true,
        subQueries: [
          {
            query: "Anti-doping rules",
            domain: "anti_doping",
            intent: "factual",
            ngbIds: [],
          },
          {
            query: "Team selection criteria",
            domain: "team_selection",
            intent: "procedural",
            ngbIds: ["usa-swimming"],
          },
        ],
      }),
    );

    expect(output.isComplex).toBe(true);
    expect(output.subQueries).toHaveLength(2);
    expect(output.subQueries[0].domain).toBe("anti_doping");
    expect(output.subQueries[1].ngbIds).toEqual(["usa-swimming"]);
    expect(warnings).toHaveLength(0);
  });

  it("parses simple (not complex) response", () => {
    const { output, warnings } = parseQueryPlannerResponse(
      JSON.stringify({
        isComplex: false,
        subQueries: [],
      }),
    );

    expect(output.isComplex).toBe(false);
    expect(output.subQueries).toEqual([]);
    expect(warnings).toHaveLength(0);
  });

  it("treats as simple when complex but fewer than 2 valid sub-queries", () => {
    const { output, warnings } = parseQueryPlannerResponse(
      JSON.stringify({
        isComplex: true,
        subQueries: [
          {
            query: "Only one sub-query",
            domain: "anti_doping",
            intent: "factual",
            ngbIds: [],
          },
        ],
      }),
    );

    expect(output.isComplex).toBe(false);
    expect(output.subQueries).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("skips sub-queries with invalid domains", () => {
    const { output, warnings } = parseQueryPlannerResponse(
      JSON.stringify({
        isComplex: true,
        subQueries: [
          {
            query: "Valid query",
            domain: "anti_doping",
            intent: "factual",
            ngbIds: [],
          },
          {
            query: "Invalid domain query",
            domain: "invalid_domain",
            intent: "factual",
            ngbIds: [],
          },
          {
            query: "Another valid query",
            domain: "governance",
            intent: "factual",
            ngbIds: [],
          },
        ],
      }),
    );

    expect(output.isComplex).toBe(true);
    expect(output.subQueries).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Invalid sub-query domain");
  });

  it("defaults invalid intent to general", () => {
    const { output, warnings } = parseQueryPlannerResponse(
      JSON.stringify({
        isComplex: true,
        subQueries: [
          {
            query: "Query 1",
            domain: "anti_doping",
            intent: "bad_intent",
            ngbIds: [],
          },
          {
            query: "Query 2",
            domain: "team_selection",
            intent: "factual",
            ngbIds: [],
          },
        ],
      }),
    );

    expect(output.subQueries[0].intent).toBe("general");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("strips markdown code fences", () => {
    const json = JSON.stringify({
      isComplex: false,
      subQueries: [],
    });

    const { output } = parseQueryPlannerResponse("```json\n" + json + "\n```");
    expect(output.isComplex).toBe(false);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseQueryPlannerResponse("not json")).toThrow();
  });

  it("skips sub-queries with missing query text", () => {
    const { output, warnings } = parseQueryPlannerResponse(
      JSON.stringify({
        isComplex: true,
        subQueries: [
          { query: "", domain: "anti_doping", intent: "factual", ngbIds: [] },
          {
            query: "Valid",
            domain: "team_selection",
            intent: "factual",
            ngbIds: [],
          },
          {
            query: "Also valid",
            domain: "governance",
            intent: "factual",
            ngbIds: [],
          },
        ],
      }),
    );

    expect(output.isComplex).toBe(true);
    expect(output.subQueries).toHaveLength(2);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("filters out invalid NGB IDs", () => {
    const { output } = parseQueryPlannerResponse(
      JSON.stringify({
        isComplex: true,
        subQueries: [
          {
            query: "Query 1",
            domain: "anti_doping",
            intent: "factual",
            ngbIds: ["valid-id", "", 123, null],
          },
          {
            query: "Query 2",
            domain: "team_selection",
            intent: "factual",
            ngbIds: [],
          },
        ],
      }),
    );

    expect(output.subQueries[0].ngbIds).toEqual(["valid-id"]);
  });

  it("limits to 4 sub-queries", () => {
    const { output } = parseQueryPlannerResponse(
      JSON.stringify({
        isComplex: true,
        subQueries: [
          { query: "q1", domain: "anti_doping", intent: "factual", ngbIds: [] },
          {
            query: "q2",
            domain: "team_selection",
            intent: "factual",
            ngbIds: [],
          },
          {
            query: "q3",
            domain: "eligibility",
            intent: "factual",
            ngbIds: [],
          },
          { query: "q4", domain: "governance", intent: "factual", ngbIds: [] },
          { query: "q5", domain: "safesport", intent: "factual", ngbIds: [] },
        ],
      }),
    );

    expect(output.subQueries.length).toBeLessThanOrEqual(4);
  });
});
