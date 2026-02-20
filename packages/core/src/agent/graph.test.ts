import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — stub every node factory and edge so createAgentGraph only exercises
// the StateGraph builder topology, not real LLM logic.
// ---------------------------------------------------------------------------

const { stubNode } = vi.hoisted(() => ({
  stubNode: vi.fn(async () => ({})),
}));

vi.mock("./nodes/index.js", () => ({
  createClassifierNode: () => stubNode,
  clarifyNode: stubNode,
  createRetrieverNode: () => stubNode,
  createResearcherNode: () => stubNode,
  createSynthesizerNode: () => stubNode,
  createEscalateNode: () => stubNode,
  citationBuilderNode: stubNode,
  disclaimerGuardNode: stubNode,
  createQualityCheckerNode: () => stubNode,
  createRetrievalExpanderNode: () => stubNode,
  createQueryPlannerNode: () => stubNode,
  emotionalSupportNode: stubNode,
}));

vi.mock("./edges/routeByDomain.js", () => ({
  routeByDomain: vi.fn(),
}));

vi.mock("./edges/needsMoreInfo.js", () => ({
  needsMoreInfo: vi.fn(),
}));

vi.mock("./edges/routeByQuality.js", () => ({
  routeByQuality: vi.fn(),
}));

vi.mock("./nodeMetrics.js", () => ({
  withMetrics: (_name: string, fn: unknown) => fn,
}));

import { createAgentGraph } from "./graph.js";
import type { GraphDependencies } from "./graph.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(): GraphDependencies {
  return {
    vectorStore: {
      similaritySearch: vi.fn(),
    } as unknown as GraphDependencies["vectorStore"],
    tavilySearch: {
      invoke: vi.fn(),
    } as unknown as GraphDependencies["tavilySearch"],
    agentModel: {
      invoke: vi.fn(),
    } as unknown as GraphDependencies["agentModel"],
    classifierModel: {
      invoke: vi.fn(),
    } as unknown as GraphDependencies["classifierModel"],
  };
}

/**
 * Extracts node names from a compiled LangGraph graph.
 * Uses Object.keys on the nodes record structure.
 */
function getNodeNames(graph: ReturnType<typeof createAgentGraph>): string[] {
  const graphRepr = graph.getGraph();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes = (graphRepr as any).nodes;
  const keys = Object.keys(nodes);
  return keys.filter((id) => id !== "__start__" && id !== "__end__");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAgentGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compiles without error", () => {
    const graph = createAgentGraph(makeDeps());
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe("function");
    expect(typeof graph.stream).toBe("function");
  });

  it("registers all expected nodes", () => {
    const graph = createAgentGraph(makeDeps());
    const nodes = getNodeNames(graph);

    const expectedNodes = [
      "classifier",
      "clarify",
      "retriever",
      "researcher",
      "synthesizer",
      "escalate",
      "citationBuilder",
      "disclaimerGuard",
      "qualityChecker",
      "retrievalExpander",
      "queryPlanner",
      "emotionalSupport",
    ];

    for (const name of expectedNodes) {
      expect(nodes).toContain(name);
    }
  });
});
