import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so references survive vi.mock() hoisting
// ---------------------------------------------------------------------------

const {
  mockCreateEmbeddings,
  mockCreateVectorStore,
  mockCreateTavilySearchTool,
  mockCreateAgentGraph,
} = vi.hoisted(() => ({
  mockCreateEmbeddings: vi.fn(),
  mockCreateVectorStore: vi.fn(),
  mockCreateTavilySearchTool: vi.fn(),
  mockCreateAgentGraph: vi.fn(),
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

vi.mock("../rag/embeddings.js", () => ({
  createEmbeddings: mockCreateEmbeddings,
}));

vi.mock("../rag/vectorStore.js", () => ({
  createVectorStore: mockCreateVectorStore,
}));

vi.mock("./nodes/researcher.js", () => ({
  createTavilySearchTool: mockCreateTavilySearchTool,
}));

vi.mock("./graph.js", () => ({
  createAgentGraph: mockCreateAgentGraph,
}));

const { mockCreateAgentModels } = vi.hoisted(() => ({
  mockCreateAgentModels: vi.fn(),
}));

vi.mock("../config/index.js", () => ({
  createAgentModels: mockCreateAgentModels,
  GRAPH_CONFIG: { invokeTimeoutMs: 90_000, streamTimeoutMs: 120_000 },
}));

import { AgentRunner, convertMessages } from "./runner.js";
import type { AgentRunnerConfig, AgentInput } from "./runner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeGraph(invokeResult: Record<string, unknown> = {}) {
  return {
    invoke: vi.fn().mockResolvedValue({
      answer: "Test answer",
      citations: [],
      escalation: undefined,
      ...invokeResult,
    }),
    stream: vi.fn().mockReturnValue(
      (async function* () {
        yield { answer: "Partial" };
        yield { answer: "Partial answer" };
      })(),
    ),
  };
}

const defaultConfig: AgentRunnerConfig = {
  databaseUrl: "postgresql://localhost:5432/test",
  openaiApiKey: "test-openai-key",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const fakeAgentModel = { invoke: vi.fn(), role: "agent" };
const fakeClassifierModel = { invoke: vi.fn(), role: "classifier" };

describe("AgentRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEmbeddings.mockReturnValue({ fake: "embeddings" });
    mockCreateVectorStore.mockResolvedValue({
      fake: "vectorStore",
      end: vi.fn().mockResolvedValue(undefined),
    });
    mockCreateTavilySearchTool.mockReturnValue({ fake: "tavily" });
    mockCreateAgentGraph.mockReturnValue(makeFakeGraph());
    mockCreateAgentModels.mockResolvedValue({
      agentModel: fakeAgentModel,
      classifierModel: fakeClassifierModel,
    });
  });

  describe("create()", () => {
    it("creates embeddings with provided OpenAI API key", async () => {
      await AgentRunner.create(defaultConfig);

      expect(mockCreateEmbeddings).toHaveBeenCalledWith("test-openai-key");
    });

    it("creates vector store with embeddings (uses shared pool)", async () => {
      await AgentRunner.create(defaultConfig);

      expect(mockCreateVectorStore).toHaveBeenCalledWith({
        fake: "embeddings",
      });
    });

    it("creates Tavily search tool when tavilyApiKey is provided", async () => {
      await AgentRunner.create({
        ...defaultConfig,
        tavilyApiKey: "test-tavily-key",
      });

      expect(mockCreateTavilySearchTool).toHaveBeenCalled();
    });

    it("does not create Tavily search tool when tavilyApiKey is absent", async () => {
      await AgentRunner.create(defaultConfig);

      expect(mockCreateTavilySearchTool).not.toHaveBeenCalled();
    });

    it("compiles agent graph with dependencies", async () => {
      await AgentRunner.create({
        ...defaultConfig,
        tavilyApiKey: "test-tavily-key",
      });

      expect(mockCreateAgentGraph).toHaveBeenCalledWith({
        vectorStore: expect.objectContaining({ fake: "vectorStore" }),
        tavilySearch: { fake: "tavily" },
        agentModel: expect.any(Object),
        classifierModel: expect.any(Object),
      });
    });

    it("passes a no-op tavily stub when tavilyApiKey is absent", async () => {
      await AgentRunner.create(defaultConfig);

      expect(mockCreateAgentGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          vectorStore: expect.objectContaining({ fake: "vectorStore" }),
          tavilySearch: expect.any(Object),
        }),
      );
    });

    it("throws when databaseUrl is empty", async () => {
      await expect(AgentRunner.create({ databaseUrl: "" })).rejects.toThrow(
        "databaseUrl is required",
      );
    });

    it("calls createAgentModels once to construct shared instances", async () => {
      await AgentRunner.create(defaultConfig);

      expect(mockCreateAgentModels).toHaveBeenCalledOnce();
    });

    it("passes model instances from factory to graph and exposes classifierModel", async () => {
      const runner = await AgentRunner.create(defaultConfig);

      // Graph should receive the exact instances from the factory
      const graphDeps = mockCreateAgentGraph.mock.calls[0]![0]!;
      expect(graphDeps.agentModel).toBe(fakeAgentModel);
      expect(graphDeps.classifierModel).toBe(fakeClassifierModel);

      // Runner should expose the classifier model for callers like generateSummary
      expect(runner.classifierModel).toBe(fakeClassifierModel);
    });
  });

  describe("invoke()", () => {
    it("returns structured AgentOutput with answer and citations", async () => {
      const graph = makeFakeGraph({
        answer: "Athletes are selected via trials.",
        citations: [
          {
            title: "Selection Procedures",
            documentType: "policy",
            snippet: "...",
          },
        ],
      });
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      const result = await runner.invoke({
        messages: [new HumanMessage("How are athletes selected?")],
      });

      expect(result.answer).toBe("Athletes are selected via trials.");
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.title).toBe("Selection Procedures");
    });

    it("returns escalation info when present in graph output", async () => {
      const graph = makeFakeGraph({
        answer: "Please contact SafeSport.",
        escalation: {
          target: "U.S. Center for SafeSport",
          organization: "SafeSport",
          reason: "abuse report",
          urgency: "immediate",
        },
      });
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      const result = await runner.invoke({
        messages: [new HumanMessage("I need to report abuse")],
      });

      expect(result.escalation).toBeDefined();
      expect(result.escalation!.target).toBe("U.S. Center for SafeSport");
      expect(result.escalation!.urgency).toBe("immediate");
    });

    it("passes userSport and conversationId to graph state", async () => {
      const graph = makeFakeGraph();
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      await runner.invoke({
        messages: [new HumanMessage("question")],
        userSport: "swimming",
        conversationId: "conv-123",
      });

      expect(graph.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          userSport: "swimming",
          conversationId: "conv-123",
        }),
        { metadata: { session_id: "conv-123" } },
      );
    });

    it("passes metadata.session_id when conversationId is provided", async () => {
      const graph = makeFakeGraph();
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      await runner.invoke({
        messages: [new HumanMessage("hello")],
        conversationId: "conv-abc",
      });

      expect(graph.invoke).toHaveBeenCalledWith(expect.anything(), {
        metadata: { session_id: "conv-abc" },
      });
    });

    it("passes no config when conversationId is absent", async () => {
      const graph = makeFakeGraph();
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      await runner.invoke({
        messages: [new HumanMessage("hello")],
      });

      expect(graph.invoke).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: undefined }),
        undefined,
      );
    });

    it("ignores conversationId with invalid format", async () => {
      const graph = makeFakeGraph();
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      await runner.invoke({
        messages: [new HumanMessage("hello")],
        conversationId: "'; DROP TABLE users; --",
      });

      // Invalid conversationId should be stripped (no metadata passed)
      expect(graph.invoke).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: undefined }),
        undefined,
      );
    });

    it("returns empty answer string when graph produces no answer", async () => {
      const graph = makeFakeGraph({ answer: undefined });
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      const result = await runner.invoke({
        messages: [new HumanMessage("test")],
      });

      expect(result.answer).toBe("");
    });

    it("propagates graph invocation errors", async () => {
      const graph = {
        invoke: vi.fn().mockRejectedValue(new Error("Graph execution failed")),
        stream: vi.fn(),
      };
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      await expect(
        runner.invoke({ messages: [new HumanMessage("test")] }),
      ).rejects.toThrow("Graph execution failed");
    });
  });

  describe("stream()", () => {
    it("yields state updates from the graph", async () => {
      const runner = await AgentRunner.create(defaultConfig);
      const updates: unknown[] = [];

      for await (const update of runner.stream({
        messages: [new HumanMessage("test")],
      })) {
        updates.push(update);
      }

      expect(updates).toHaveLength(2);
      expect(updates[0]).toEqual({ answer: "Partial" });
      expect(updates[1]).toEqual({ answer: "Partial answer" });
    });

    it("passes input state and streamMode values to graph.stream", async () => {
      const graph = makeFakeGraph();
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      // Consume the generator
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of runner.stream({
        messages: [new HumanMessage("test")],
        userSport: "track",
      })) {
        // consume
      }

      expect(graph.stream).toHaveBeenCalledWith(
        expect.objectContaining({
          userSport: "track",
        }),
        { streamMode: ["values", "messages"] },
      );
    });

    it("passes metadata.session_id when conversationId is provided", async () => {
      const graph = makeFakeGraph();
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of runner.stream({
        messages: [new HumanMessage("hello")],
        conversationId: "conv-456",
      })) {
        // consume
      }

      expect(graph.stream).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: "conv-456" }),
        {
          streamMode: ["values", "messages"],
          metadata: { session_id: "conv-456" },
        },
      );
    });

    it("passes no metadata when conversationId is absent", async () => {
      const graph = makeFakeGraph();
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of runner.stream({
        messages: [new HumanMessage("hello")],
      })) {
        // consume
      }

      expect(graph.stream).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: undefined }),
        { streamMode: ["values", "messages"] },
      );
    });

    it("propagates stream errors", async () => {
      const graph = {
        invoke: vi.fn(),
        stream: vi.fn().mockReturnValue(
          (async function* () {
            yield { answer: "ok" };
            throw new Error("Stream broke");
          })(),
        ),
      };
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);
      const updates: unknown[] = [];

      await expect(async () => {
        for await (const update of runner.stream({
          messages: [new HumanMessage("test")],
        })) {
          updates.push(update);
        }
      }).rejects.toThrow("Stream broke");

      expect(updates).toHaveLength(1);
    });

    it("throws TimeoutError when stream exceeds deadline", async () => {
      // Create a slow stream that yields chunks with delays
      const graph = {
        invoke: vi.fn(),
        stream: vi.fn().mockReturnValue(
          (async function* () {
            yield { answer: "first" };
            // Simulate a very slow stream by advancing time past the deadline
            // We'll use Date.now mock to simulate this
            yield { answer: "second" };
          })(),
        ),
      };
      mockCreateAgentGraph.mockReturnValue(graph);

      const runner = await AgentRunner.create(defaultConfig);

      // Mock Date.now to simulate time passing past the deadline
      const originalNow = Date.now;
      let callCount = 0;
      vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        // First call: buildInitialState sets deadline
        // Second call (first check): within deadline
        // Third call (second check): past deadline
        if (callCount <= 2) return originalNow.call(Date);
        return originalNow.call(Date) + 200_000; // Past the 120s timeout
      });

      const updates: unknown[] = [];

      await expect(async () => {
        for await (const update of runner.stream({
          messages: [new HumanMessage("test")],
        })) {
          updates.push(update);
        }
      }).rejects.toThrow("timed out");

      // Should have gotten at least one chunk before timeout
      expect(updates).toHaveLength(1);

      vi.restoreAllMocks();
    });
  });

  describe("close()", () => {
    it("delegates to vectorStore.end()", async () => {
      const mockEnd = vi.fn().mockResolvedValue(undefined);
      mockCreateVectorStore.mockResolvedValue({
        fake: "vectorStore",
        end: mockEnd,
      });

      const runner = await AgentRunner.create(defaultConfig);
      await runner.close();

      expect(mockEnd).toHaveBeenCalledOnce();
    });
  });

  describe("invoke() timeout", () => {
    it("throws TimeoutError when graph.invoke hangs", async () => {
      const graph = {
        invoke: vi.fn().mockReturnValue(
          new Promise(() => {
            // Never resolves — withTimeout will reject after the deadline
          }),
        ),
        stream: vi.fn(),
      };
      mockCreateAgentGraph.mockReturnValue(graph);

      // Use a short timeout so the test completes quickly
      const config = await import("../config/index.js");
      const saved = config.GRAPH_CONFIG.invokeTimeoutMs;
      Object.assign(config.GRAPH_CONFIG, { invokeTimeoutMs: 50 });

      try {
        const runner = await AgentRunner.create(defaultConfig);
        await expect(
          runner.invoke({ messages: [new HumanMessage("test")] }),
        ).rejects.toThrow("timed out");
      } finally {
        Object.assign(config.GRAPH_CONFIG, { invokeTimeoutMs: saved });
      }
    });
  });
});

describe("convertMessages", () => {
  it("converts user messages to HumanMessage", () => {
    const result = convertMessages([{ role: "user", content: "Hello" }]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0]!.content).toBe("Hello");
  });

  it("converts assistant messages to AIMessage", () => {
    const result = convertMessages([
      { role: "assistant", content: "Hi there" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[0]!.content).toBe("Hi there");
  });

  it("converts a mixed conversation", () => {
    const result = convertMessages([
      { role: "user", content: "What is USADA?" },
      { role: "assistant", content: "USADA is..." },
      { role: "user", content: "Tell me more" },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[1]).toBeInstanceOf(AIMessage);
    expect(result[2]).toBeInstanceOf(HumanMessage);
  });

  it("defaults unknown roles to HumanMessage", () => {
    const result = convertMessages([{ role: "system", content: "sys prompt" }]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
  });

  it("returns empty array for empty input", () => {
    const result = convertMessages([]);
    expect(result).toEqual([]);
  });
});
