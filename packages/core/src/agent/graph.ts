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
  const compiled = new StateGraph(AgentStateAnnotation)
    .addNode("classifier", classifierNode)
    .addNode("clarify", clarifyNode)
    .addNode("retriever", createRetrieverNode(deps.vectorStore))
    .addNode("researcher", createResearcherNode(deps.tavilySearch))
    .addNode("synthesizer", synthesizerNode)
    .addNode("escalate", escalateNode)
    .addNode("citationBuilder", citationBuilderNode)
    .addNode("disclaimerGuard", disclaimerGuardNode)
    .addEdge("__start__", "classifier")
    .addConditionalEdges("classifier", routeByDomain)
    .addEdge("clarify", "__end__")
    .addConditionalEdges("retriever", needsMoreInfo)
    .addEdge("researcher", "synthesizer")
    .addEdge("synthesizer", "citationBuilder")
    .addEdge("escalate", "citationBuilder")
    .addEdge("citationBuilder", "disclaimerGuard")
    .addEdge("disclaimerGuard", "__end__")
    .compile();

  return compiled;
}
