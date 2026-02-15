import type { EmotionalState } from "../types/index.js";

/**
 * USOPC Mental Health contact for inclusion in distressed-athlete preambles.
 */
export const MENTAL_HEALTH_RESOURCE =
  "USOPC Mental Health Support: Contact the USOPC Athlete Services team or " +
  "call the Mental Health Helpline at 1-888-602-9002 for free, confidential support.";

/**
 * Empathy preambles keyed by detected emotional state.
 * These are prepended to the agent's answer so the athlete feels heard
 * before receiving procedural guidance.
 */
export const EMPATHY_PREAMBLES: Record<EmotionalState, string> = {
  neutral: "",

  distressed:
    "I hear you, and I want you to know that what you're feeling is valid. " +
    "You are not alone in this — support is available.\n\n" +
    `${MENTAL_HEALTH_RESOURCE}\n\n` +
    "Here's what I can share about your situation:\n\n",

  panicked:
    "I understand this feels overwhelming right now. Take a breath — " +
    "there are concrete steps you can take, and I'll walk you through them.\n\n",

  fearful:
    "I want you to know that retaliation protections exist to keep you safe, and " +
    "there are confidential ways to get help. You have the right to speak up " +
    "without fear of losing your place.\n\n",
};

/**
 * Returns the empathy preamble for a given emotional state.
 * Returns an empty string for neutral (no-op).
 */
export function getEmpathyPreamble(state: EmotionalState): string {
  return EMPATHY_PREAMBLES[state] ?? "";
}

/**
 * Prepends an empathy preamble to an answer.
 * No-op for neutral state.
 */
export function withEmpathy(answer: string, state: EmotionalState): string {
  const preamble = getEmpathyPreamble(state);
  if (!preamble) return answer;
  return preamble + answer;
}

/**
 * Returns tone guidance instructions for the synthesizer prompt
 * when the user is in a non-neutral emotional state.
 * Returns an empty string for neutral (no-op).
 */
export function getEmotionalToneGuidance(state: EmotionalState): string {
  if (state === "neutral") return "";

  const guidance: Record<Exclude<EmotionalState, "neutral">, string> = {
    distressed:
      "\n\nIMPORTANT TONE GUIDANCE: The user is emotionally distressed. " +
      "Use a warm, supportive tone throughout your response. Acknowledge their " +
      "feelings before providing procedural information. Avoid cold, bureaucratic " +
      "language. Frame action steps as empowering options, not obligations.",
    panicked:
      "\n\nIMPORTANT TONE GUIDANCE: The user is in a panicked state. " +
      "Use calm, reassuring language. Emphasize that concrete steps exist and " +
      "that the situation can be addressed. Present information in a clear, " +
      "ordered way to reduce overwhelm. Avoid alarming language.",
    fearful:
      "\n\nIMPORTANT TONE GUIDANCE: The user is fearful, likely about retaliation " +
      "or consequences. Emphasize confidentiality protections and anti-retaliation " +
      "provisions. Use reassuring language about their rights and safety. " +
      "Frame reporting options as safe and protected actions.",
  };

  return guidance[state];
}
