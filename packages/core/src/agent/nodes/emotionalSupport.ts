import { generateSupportContext } from "../../services/emotionalSupport.js";
import type { AgentState } from "../state.js";

/**
 * EMOTIONAL SUPPORT node.
 *
 * Generates domain-aware, trauma-informed emotional support context for
 * non-neutral emotional states. Runs before the synthesizer so that it
 * can inject situation-specific acknowledgments, guidance, safety resources,
 * and tone modifiers into the response.
 *
 * Pure template lookup — no LLM call, no external dependencies.
 */
export async function emotionalSupportNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const context = generateSupportContext(
    state.emotionalState,
    state.topicDomain,
  );
  return { emotionalSupportContext: context };
}
