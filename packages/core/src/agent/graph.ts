import type { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph } from "@langchain/langgraph";
import { AgentStateAnnotation } from "./state.js";
import {
  createClassifierNode,
  clarifyNode,
  createRetrieverNode,
  createResearcherNode,
  createSynthesizerNode,
  createEscalateNode,
  citationBuilderNode,
  disclaimerGuardNode,
  createQualityCheckerNode,
  createRetrievalExpanderNode,
  createQueryPlannerNode,
  emotionalSupportNode,
} from "./nodes/index.js";
import type { VectorStoreLike } from "./nodes/index.js";
import type { TavilySearchLike } from "./nodes/index.js";
import { routeByDomain } from "./edges/routeByDomain.js";
import { createNeedsMoreInfo } from "./edges/needsMoreInfo.js";
import { routeByQuality } from "./edges/routeByQuality.js";
import { withMetrics } from "./nodeMetrics.js";
import { getFeatureFlags } from "../config/featureFlags.js";

export interface GraphDependencies {
  vectorStore: VectorStoreLike;
  tavilySearch: TavilySearchLike;
  agentModel: ChatAnthropic;
  classifierModel: ChatAnthropic;
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
 * Graph flow (parallelResearch ON):
 *   ...same as above, but gray-zone confidence (0.5 ≤ c < 0.75) routes to
 *   researcher before synthesizer so web results supplement borderline retrieval.
 *
 * Graph flow (expansion ON):
 *   ...same as above, but:
 *     retriever -> (needsMoreInfo) -> synthesizer | retrievalExpander | researcher
 *     retrievalExpander -> (needsMoreInfoAfterExpansion) -> synthesizer | researcher
 * Graph flow (query planner ON):
 *   ...same as above, but classifier routes through queryPlanner before retriever:
 *     classifier -> queryPlanner -> retriever
 *
 * Graph flow (quality checker ON):
 *   ...same as above, but:
 *     synthesizer -> qualityChecker -> (routeByQuality) -> citationBuilder | synthesizer(retry)
 */
export function createAgentGraph(deps: GraphDependencies) {
  const flags = getFeatureFlags();

  // All nodes registered unconditionally for TypeScript generic tracking.
  const builder = new StateGraph(AgentStateAnnotation)
    .addNode(
      "classifier",
      withMetrics("classifier", createClassifierNode(deps.classifierModel)),
    )
    .addNode("clarify", withMetrics("clarify", clarifyNode))
    .addNode(
      "retriever",
      withMetrics("retriever", createRetrieverNode(deps.vectorStore)),
    )
    .addNode(
      "researcher",
      withMetrics("researcher", createResearcherNode(deps.tavilySearch)),
    )
    .addNode(
      "synthesizer",
      withMetrics("synthesizer", createSynthesizerNode(deps.agentModel)),
    )
    .addNode(
      "escalate",
      withMetrics("escalate", createEscalateNode(deps.agentModel)),
    )
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
      withMetrics(
        "qualityChecker",
        createQualityCheckerNode(deps.classifierModel),
      ),
    )
    .addNode(
      "retrievalExpander",
      withMetrics(
        "retrievalExpander",
        createRetrievalExpanderNode(deps.vectorStore, deps.classifierModel),
      ),
    )
    .addNode(
      "queryPlanner",
      withMetrics("queryPlanner", createQueryPlannerNode(deps.classifierModel)),
    )
    .addNode(
      "emotionalSupport",
      withMetrics("emotionalSupport", emotionalSupportNode),
    );

  // Determine pre-synthesizer target: emotional support node when flag is on
  const preSynth = (
    flags.emotionalSupport ? "emotionalSupport" : "synthesizer"
  ) as "emotionalSupport" | "synthesizer";

  if (flags.emotionalSupport) {
    builder.addEdge("emotionalSupport", "synthesizer");
  }

  // Edges
  builder.addEdge("__start__", "classifier");
  builder.addConditionalEdges("classifier", routeByDomain);
  builder.addEdge("clarify", "__end__");

  builder.addEdge("queryPlanner", "retriever");

  const needsMoreInfoPathMap = {
    synthesizer: preSynth,
    researcher: "researcher" as const,
    retrievalExpander: "retrievalExpander" as const,
  };

  if (flags.retrievalExpansion) {
    // Retriever routes to expander when confidence is low and expansion not attempted
    builder.addConditionalEdges(
      "retriever",
      createNeedsMoreInfo(true, flags.parallelResearch),
      needsMoreInfoPathMap,
    );
    // After expansion, route to synthesizer or researcher (never back to expander)
    builder.addConditionalEdges(
      "retrievalExpander",
      createNeedsMoreInfo(false, flags.parallelResearch),
      needsMoreInfoPathMap,
    );
  } else {
    builder.addConditionalEdges(
      "retriever",
      createNeedsMoreInfo(false, flags.parallelResearch),
      needsMoreInfoPathMap,
    );
  }
  builder.addEdge("researcher", preSynth);

  if (flags.qualityChecker) {
    // Quality checker loop: synthesizer → qualityChecker → route → {citationBuilder | synthesizer(retry)}
    builder.addEdge("synthesizer", "qualityChecker");
    builder.addConditionalEdges("qualityChecker", routeByQuality, {
      citationBuilder: "citationBuilder" as const,
      synthesizer: preSynth,
    });
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
