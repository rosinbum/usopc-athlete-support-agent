import { logger } from "@usopc/shared";
import { getDisclaimer } from "../../prompts/index.js";
import type { AgentState } from "../state.js";

const log = logger.child({ service: "disclaimer-guard-node" });

/**
 * DISCLAIMER_GUARD node.
 *
 * Appends domain-appropriate disclaimers to the agent's answer.
 * Always includes the "not legal advice" disclaimer, with additional
 * domain-specific disclaimers for SafeSport, anti-doping, disputes, etc.
 */
export async function disclaimerGuardNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  if (!state.answer) {
    return {};
  }

  const disclaimer = getDisclaimer(state.topicDomain);

  log.info("Appending disclaimer", {
    topicDomain: state.topicDomain ?? "none",
  });

  const answer = state.answer + "\n\n---\n\n" + disclaimer;

  return {
    answer,
    disclaimerRequired: true,
  };
}
