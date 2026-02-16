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
  qualityCheckerNode,
  createRetrievalExpanderNode,
} from "./nodes/index.js";
import type { VectorStoreLike } from "./nodes/index.js";
import type { TavilySearchLike } from "./nodes/index.js";
import { routeByDomain } from "./edges/routeByDomain.js";
import { needsMoreInfo, createNeedsMoreInfo } from "./edges/needsMoreInfo.js";
import { routeByQuality } from "./edges/routeByQuality.js";
import { withMetrics } from "./nodeMetrics.js";
import { getFeatureFlags } from "../config/featureFlags.js";

export interface GraphDependencies {
  vectorStore: VectorStoreLike;
  tavilySearch: TavilySearchLike;
}

/**
 * Creates and compiles the full LangGraph agent.
 *
 * Graph flow (quality checker OFF, expansion OFF — default):
 *   START -> classifier -> (routeByDomain) -> clarify | retriever | escalate
 *     clarify -> END
 *     retriever -> (needsMoreInfo) -> synthesizer | researcher
 *     researcher -> synthesizer
 *     synthesizer -> citationBuilder -> disclaimerGuard -> END
 *     escalate -> citationBuilder -> disclaimerGuard -> END
 *
 * Graph flow (expansion ON):
 *   ...same as above, but:
 *     retriever -> (needsMoreInfo) -> synthesizer | retrievalExpander | researcher
 *     retrievalExpander -> (needsMoreInfoAfterExpansion) -> synthesizer | researcher
 *
 * Graph flow (quality checker ON):
 *   ...same as above, but:
 *     synthesizer -> qualityChecker -> (routeByQuality) -> citationBuilder | synthesizer(retry)
 */
export function createAgentGraph(deps: GraphDependencies) {
  const flags = getFeatureFlags();

  // All nodes registered unconditionally for TypeScript generic tracking.
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
    )
    .addNode(
      "qualityChecker",
      withMetrics("qualityChecker", qualityCheckerNode),
    )
    .addNode(
      "retrievalExpander",
      withMetrics(
        "retrievalExpander",
        createRetrievalExpanderNode(deps.vectorStore),
      ),
    );

  // Edges
  builder.addEdge("__start__", "classifier");
  builder.addConditionalEdges("classifier", routeByDomain);
  builder.addEdge("clarify", "__end__");

  if (flags.retrievalExpansion) {
    // Retriever routes to expander when confidence is low and expansion not attempted
    builder.addConditionalEdges("retriever", createNeedsMoreInfo(true));
    // After expansion, route to synthesizer or researcher (never back to expander)
    builder.addConditionalEdges(
      "retrievalExpander",
      createNeedsMoreInfo(false),
    );
  } else {
    builder.addConditionalEdges("retriever", needsMoreInfo);
  }

  builder.addEdge("researcher", "synthesizer");

  if (flags.qualityChecker) {
    // Quality checker loop: synthesizer → qualityChecker → route → {citationBuilder | synthesizer}
    builder.addEdge("synthesizer", "qualityChecker");
    builder.addConditionalEdges("qualityChecker", routeByQuality);
  } else {
    // Default: synthesizer → citationBuilder (no quality checking)
    builder.addEdge("synthesizer", "citationBuilder");
  }

  builder.addEdge("escalate", "citationBuilder");
  builder.addEdge("citationBuilder", "disclaimerGuard");
  builder.addEdge("disclaimerGuard", "__end__");

  const compiled = builder.compile();

  return compiled;
}
