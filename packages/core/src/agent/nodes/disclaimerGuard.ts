import { logger } from "@usopc/shared";
import { getDisclaimer } from "../../prompts/index.js";
import type { AgentState } from "../state.js";

const log = logger.child({ service: "disclaimer-guard-node" });

/**
 * DISCLAIMER_GUARD node.
 *
 * Sets structured disclaimer text for domain-appropriate disclaimers.
 * Consumers (web, Slack) render the disclaimer independently rather
 * than having it embedded in the answer text.
 */
export async function disclaimerGuardNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  if (!state.answer) {
    return {};
  }

  const disclaimer = getDisclaimer(state.topicDomain);

  log.info("Setting disclaimer", {
    topicDomain: state.topicDomain ?? "none",
  });

  return {
    disclaimer,
    disclaimerRequired: true,
  };
}
