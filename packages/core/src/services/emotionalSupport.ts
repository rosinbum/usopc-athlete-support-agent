import type {
  EmotionalState,
  EmotionalSupportContext,
  TopicDomain,
} from "../types/index.js";
import {
  getAcknowledgment,
  getGuidance,
  getSafetyResources,
  getToneModifiers,
} from "../prompts/emotionalSupport.js";

/**
 * Generates domain-aware emotional support context for non-neutral emotional
 * states. Returns `undefined` for neutral state (no support context needed).
 *
 * Pure function — no LLM call, no external dependencies.
 */
export function generateSupportContext(
  emotionalState: EmotionalState,
  topicDomain?: TopicDomain,
): EmotionalSupportContext | undefined {
  if (emotionalState === "neutral") return undefined;

  return {
    acknowledgment: getAcknowledgment(emotionalState, topicDomain),
    guidance: getGuidance(emotionalState, topicDomain),
    safetyResources: getSafetyResources(topicDomain),
    toneModifiers: getToneModifiers(emotionalState),
  };
}
