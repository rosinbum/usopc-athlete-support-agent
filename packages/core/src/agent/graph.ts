import { StateGraph } from "@langchain/langgraph";
import { AgentStateAnnotation } from "./state.js";
import {
  classifierNode,
  clarifyNode,
  createRetrieverNode,
  createResearcherNode,
  synthesizerNode,
  escalateNode,
  citationBuilderNode,
  disclaimerGuardNode,
} from "./nodes/index.js";
import type { VectorStoreLike } from "./nodes/index.js";
import type { TavilySearchLike } from "./nodes/index.js";
import { routeByDomain } from "./edges/routeByDomain.js";
import { needsMoreInfo } from "./edges/needsMoreInfo.js";
import { withMetrics } from "./nodeMetrics.js";
import { getFeatureFlags } from "../config/featureFlags.js";

export interface GraphDependencies {
  vectorStore: VectorStoreLike;
  tavilySearch: TavilySearchLike;
}

/**
 * Creates and compiles the full LangGraph agent.
 *
 * Graph flow:
 *   START -> classifier -> (routeByDomain) -> clarify | retriever | escalate
 *     clarify -> END
 *     retriever -> (needsMoreInfo) -> synthesizer | researcher
 *     researcher -> synthesizer
 *     synthesizer -> citationBuilder -> disclaimerGuard -> END
 *     escalate -> citationBuilder -> disclaimerGuard -> END
 */
export function createAgentGraph(deps: GraphDependencies) {
  const flags = getFeatureFlags();

  // Base nodes — chained for TypeScript generic tracking
  const builder = new StateGraph(AgentStateAnnotation)
    .addNode("classifier", withMetrics("classifier", classifierNode))
    .addNode("clarify", withMetrics("clarify", clarifyNode))
    .addNode(
      "retriever",
      withMetrics("retriever", createRetrieverNode(deps.vectorStore)),
    )
    .addNode(
      "researcher",
      withMetrics("researcher", createResearcherNode(deps.tavilySearch)),
    )
    .addNode("synthesizer", withMetrics("synthesizer", synthesizerNode))
    .addNode("escalate", withMetrics("escalate", escalateNode))
    .addNode(
      "citationBuilder",
      withMetrics("citationBuilder", citationBuilderNode),
    )
    .addNode(
      "disclaimerGuard",
      withMetrics("disclaimerGuard", disclaimerGuardNode),
    );

  // Edges
  builder.addEdge("__start__", "classifier");
  builder.addConditionalEdges("classifier", routeByDomain);
  builder.addEdge("clarify", "__end__");
  builder.addConditionalEdges("retriever", needsMoreInfo);
  builder.addEdge("researcher", "synthesizer");
  builder.addEdge("synthesizer", "citationBuilder");
  builder.addEdge("escalate", "citationBuilder");
  builder.addEdge("citationBuilder", "disclaimerGuard");
  builder.addEdge("disclaimerGuard", "__end__");

  // TODO: Use `flags` for conditional node/edge insertion (#155-#160)
  void flags;

  const compiled = builder.compile();

  return compiled;
}
