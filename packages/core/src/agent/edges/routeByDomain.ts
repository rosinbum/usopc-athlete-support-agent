import type { AgentState } from "../state.js";

/**
 * Conditional edge after CLASSIFIER.
 *
 * Routes based on classification results:
 * - needsClarification=true -> clarify node (ask user for more info)
 * - "escalation" intent -> escalate node (SafeSport, urgent disputes, etc.)
 * - other intents -> queryPlanner node (decompose multi-domain queries)
 */
export function routeByDomain(
  state: AgentState,
): "clarify" | "escalate" | "queryPlanner" {
  // First check if clarification is needed
  if (state.needsClarification) {
    return "clarify";
  }

  // Then check for escalation
  if (state.queryIntent === "escalation") {
    return "escalate";
  }

  return "queryPlanner";
}
