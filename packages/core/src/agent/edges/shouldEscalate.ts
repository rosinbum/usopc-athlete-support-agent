import type { AgentState } from "../state.js";

/**
 * Checks if escalation is needed based on domain and urgency signals.
 * Used as an additional guard in edge routing.
 */
export function shouldEscalate(state: AgentState): boolean {
  if (state.queryIntent === "escalation") return true;

  const urgentDomains = ["safesport", "anti_doping"];
  if (
    state.topicDomain &&
    urgentDomains.includes(state.topicDomain) &&
    state.hasTimeConstraint
  ) {
    return true;
  }

  return false;
}
