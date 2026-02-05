import type { AgentState } from "../agent/state.js";

/**
 * Extracts key identifying fields from agent state for structured logging.
 * Spread into log calls: `log.error("msg", { ...stateContext(state) })`
 */
export function stateContext(state: AgentState): Record<string, unknown> {
  return {
    conversationId: state.conversationId,
    topicDomain: state.topicDomain,
    queryIntent: state.queryIntent,
    userSport: state.userSport,
  };
}
