import { getFeatureFlags } from "../../config/featureFlags.js";
import type { AgentState } from "../state.js";

/**
 * Conditional edge after CLASSIFIER.
 *
 * Routes based on classification results:
 * - needsClarification=true -> clarify node (ask user for more info)
 * - "escalation" intent -> escalate node (SafeSport, urgent disputes, etc.)
 * - queryPlanner flag on -> queryPlanner node (decompose multi-domain queries)
 * - other intents -> retriever node
 */
export function routeByDomain(
  state: AgentState,
): "clarify" | "retriever" | "escalate" | "queryPlanner" {
  // First check if clarification is needed
  if (state.needsClarification) {
    return "clarify";
  }

  // Then check for escalation
  if (state.queryIntent === "escalation") {
    return "escalate";
  }

  // Route through query planner when feature flag is enabled
  const flags = getFeatureFlags();
  if (flags.queryPlanner) {
    return "queryPlanner";
  }

  // Default to retrieval
  return "retriever";
}
