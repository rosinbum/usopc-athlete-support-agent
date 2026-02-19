import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockCreateEmbeddings,
  mockCreateVectorStore,
  mockCreateTavilySearchTool,
  mockCreateAgentGraph,
  mockCreateAgentModels,
} = vi.hoisted(() => ({
  mockCreateEmbeddings: vi.fn(),
  mockCreateVectorStore: vi.fn(),
  mockCreateTavilySearchTool: vi.fn(),
  mockCreateAgentGraph: vi.fn(),
  mockCreateAgentModels: vi.fn(),
}));

vi.mock("./rag/embeddings.js", () => ({
  createEmbeddings: mockCreateEmbeddings,
}));

vi.mock("./rag/vectorStore.js", () => ({
  createVectorStore: mockCreateVectorStore,
}));

vi.mock("./agent/nodes/researcher.js", () => ({
  createTavilySearchTool: mockCreateTavilySearchTool,
}));

vi.mock("./agent/graph.js", () => ({
  createAgentGraph: mockCreateAgentGraph,
}));

vi.mock("./config/index.js", () => ({
  createAgentModels: mockCreateAgentModels,
}));

import { createGraph } from "./studio.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeAgentModel = { invoke: vi.fn(), role: "agent" };
const fakeClassifierModel = { invoke: vi.fn(), role: "classifier" };

describe("studio createGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.TAVILY_API_KEY;

    mockCreateEmbeddings.mockReturnValue({ fake: "embeddings" });
    mockCreateVectorStore.mockResolvedValue({ fake: "vectorStore" });
    mockCreateTavilySearchTool.mockReturnValue({ fake: "tavily" });
    mockCreateAgentGraph.mockReturnValue({ fake: "compiledGraph" });
    mockCreateAgentModels.mockResolvedValue({
      agentModel: fakeAgentModel,
      classifierModel: fakeClassifierModel,
    });
  });

  it("creates embeddings from OPENAI_API_KEY env var", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    await createGraph();
    expect(mockCreateEmbeddings).toHaveBeenCalledWith("test-key");
  });

  it("creates vector store with embeddings", async () => {
    await createGraph();
    expect(mockCreateVectorStore).toHaveBeenCalledWith({ fake: "embeddings" });
  });

  it("creates Tavily search when TAVILY_API_KEY is set", async () => {
    process.env.TAVILY_API_KEY = "tavily-key";
    await createGraph();
    expect(mockCreateTavilySearchTool).toHaveBeenCalledWith("tavily-key");
  });

  it("uses no-op Tavily stub when TAVILY_API_KEY is absent", async () => {
    await createGraph();
    expect(mockCreateTavilySearchTool).not.toHaveBeenCalled();

    const graphDeps = mockCreateAgentGraph.mock.calls[0][0];
    // The stub should still be invocable
    expect(typeof graphDeps.tavilySearch.invoke).toBe("function");
    expect(await graphDeps.tavilySearch.invoke()).toBe("");
  });

  it("calls createAgentModels once", async () => {
    await createGraph();
    expect(mockCreateAgentModels).toHaveBeenCalledOnce();
  });

  it("passes model instances to createAgentGraph", async () => {
    await createGraph();
    const graphDeps = mockCreateAgentGraph.mock.calls[0][0];
    expect(graphDeps.agentModel).toBe(fakeAgentModel);
    expect(graphDeps.classifierModel).toBe(fakeClassifierModel);
  });

  it("returns the compiled graph", async () => {
    const result = await createGraph();
    expect(result).toEqual({ fake: "compiledGraph" });
  });
});
