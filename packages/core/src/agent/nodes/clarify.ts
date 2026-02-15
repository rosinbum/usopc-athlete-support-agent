import { logger } from "@usopc/shared";
import { withEmpathy } from "../../prompts/index.js";
import type { AgentState } from "../state.js";

const log = logger.child({ service: "clarify-node" });

/**
 * Default clarification question when the classifier doesn't provide one.
 */
const DEFAULT_CLARIFICATION =
  "I'd like to help you, but I need a bit more information. Could you please specify which sport or organization your question relates to?";

/**
 * CLARIFY node.
 *
 * Returns a clarifying question to the user when the classifier determines
 * the query is too ambiguous to answer accurately.
 *
 * This node:
 * 1. Uses the clarificationQuestion from the classifier if available
 * 2. Falls back to a default question if none was provided
 * 3. Sets disclaimerRequired to false (no disclaimer needed for clarification)
 */
export async function clarifyNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  // Use the classifier's question if provided, otherwise use default
  const question =
    state.clarificationQuestion && state.clarificationQuestion.trim()
      ? state.clarificationQuestion
      : DEFAULT_CLARIFICATION;

  log.info("Clarification needed", {
    topicDomain: state.topicDomain,
    clarificationQuestion: question,
  });

  return {
    answer: withEmpathy(question, state.emotionalState),
    disclaimerRequired: false, // No disclaimer needed for clarification questions
  };
}
