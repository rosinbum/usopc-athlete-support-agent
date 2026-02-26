import type { Pool } from "pg";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
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
import { needsMoreInfo } from "./edges/needsMoreInfo.js";
import { routeByQuality } from "./edges/routeByQuality.js";
import { withMetrics } from "./nodeMetrics.js";

/**
 * External dependencies injected into the LangGraph agent at construction time.
 *
 * Model instances are created once by {@link AgentRunner.create} and shared
 * across all graph nodes via closure injection (factory functions). This
 * eliminates redundant model allocations per request — in a Lambda
 * warm container the same instances are reused for the lifetime of the process.
 *
 * Changing model configuration (model name, temperature, maxTokens) requires
 * a cold start — the runner must be recreated with fresh instances.
 */
export interface GraphDependencies {
  vectorStore: VectorStoreLike;
  tavilySearch: TavilySearchLike;
  /** Database pool for BM25 full-text search queries. */
  pool: Pool;
  /** Sonnet instance used by synthesizer, escalate, and other heavy-reasoning nodes. */
  agentModel: BaseChatModel;
  /** Haiku instance used by classifier, qualityChecker, queryPlanner, and retrievalExpander. */
  classifierModel: BaseChatModel;
}

/**
 * Creates and compiles the full LangGraph agent.
 *
 * Graph flow:
 *   START -> classifier -> (routeByDomain) -> clarify | queryPlanner | escalate
 *     clarify -> END
 *     queryPlanner -> retriever
 *     retriever -> (needsMoreInfo) -> emotionalSupport | retrievalExpander | researcher
 *     retrievalExpander -> (needsMoreInfo) -> emotionalSupport | researcher
 *     researcher -> emotionalSupport -> synthesizer
 *     synthesizer -> qualityChecker -> (routeByQuality) -> citationBuilder | emotionalSupport(retry)
 *     citationBuilder -> disclaimerGuard -> END
 *     escalate -> citationBuilder -> disclaimerGuard -> END
 */
export function createAgentGraph(deps: GraphDependencies) {
  // All nodes registered unconditionally for TypeScript generic tracking.
  const builder = new StateGraph(AgentStateAnnotation)
    .addNode(
      "classifier",
      withMetrics("classifier", createClassifierNode(deps.classifierModel)),
    )
    .addNode("clarify", withMetrics("clarify", clarifyNode))
    .addNode(
      "retriever",
      withMetrics(
        "retriever",
        createRetrieverNode(deps.vectorStore, deps.pool),
      ),
    )
    .addNode(
      "researcher",
      withMetrics(
        "researcher",
        createResearcherNode(deps.tavilySearch, deps.classifierModel),
      ),
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
        createRetrievalExpanderNode(
          deps.vectorStore,
          deps.classifierModel,
          deps.pool,
        ),
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

  const preSynth = "emotionalSupport" as const;

  builder.addEdge("emotionalSupport", "synthesizer");

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

  // Retriever routes to expander when confidence is low and expansion not attempted
  builder.addConditionalEdges("retriever", needsMoreInfo, needsMoreInfoPathMap);
  // After expansion, route to synthesizer or researcher (never back to expander
  // since expansionAttempted will be true)
  builder.addConditionalEdges(
    "retrievalExpander",
    needsMoreInfo,
    needsMoreInfoPathMap,
  );
  builder.addEdge("researcher", preSynth);

  // Quality checker loop: synthesizer → qualityChecker → route → {citationBuilder | synthesizer(retry)}
  builder.addEdge("synthesizer", "qualityChecker");
  builder.addConditionalEdges("qualityChecker", routeByQuality, {
    citationBuilder: "citationBuilder" as const,
    synthesizer: preSynth,
  });

  builder.addEdge("escalate", "citationBuilder");
  builder.addEdge("citationBuilder", "disclaimerGuard");
  builder.addEdge("disclaimerGuard", "__end__");

  const compiled = builder.compile();

  return compiled;
}
