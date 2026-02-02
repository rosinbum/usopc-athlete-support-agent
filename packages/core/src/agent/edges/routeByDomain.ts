import type { AgentState } from "../state.js";

/**
 * Conditional edge after CLASSIFIER.
 *
 * Routes based on the classified query intent:
 * - "escalation" -> escalate node (SafeSport, urgent disputes, etc.)
 * - "factual" | "procedural" | "deadline" | "general" -> retriever node
 */
export function routeByDomain(
  state: AgentState,
): "retriever" | "escalate" | "researcher" {
  if (state.queryIntent === "escalation") {
    return "escalate";
  }

  return "retriever";
}
