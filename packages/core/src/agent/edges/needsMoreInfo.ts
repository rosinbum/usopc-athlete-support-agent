import { RETRIEVAL_CONFIG } from "../../config/index.js";
import type { AgentState } from "../state.js";

/**
 * Conditional edge function after RETRIEVER and RETRIEVAL_EXPANDER.
 *
 * Routes based on retrieval confidence (expansion and parallel research always enabled):
 * - High confidence (>= grayZoneUpperThreshold) -> synthesizer
 * - Web results already exist -> synthesizer
 * - Gray-zone confidence ([threshold, grayZoneUpperThreshold)) -> researcher
 * - Low confidence, expansion not yet attempted -> retrievalExpander
 * - Low confidence, expansion done -> researcher
 */
export function needsMoreInfo(
  state: AgentState,
): "synthesizer" | "researcher" | "retrievalExpander" {
  const { confidenceThreshold, grayZoneUpperThreshold } = RETRIEVAL_CONFIG;

  // High confidence — skip research entirely
  if (state.retrievalConfidence >= grayZoneUpperThreshold) {
    return "synthesizer";
  }

  // If we already have web search results, go to synthesizer
  if (state.webSearchResults.length > 0) {
    return "synthesizer";
  }

  // Gray-zone: above threshold but below upper — route to researcher
  // so web search results are available to the synthesizer
  if (state.retrievalConfidence >= confidenceThreshold) {
    return "researcher";
  }

  // Low confidence — try expansion first if not yet attempted
  if (!state.expansionAttempted) {
    return "retrievalExpander";
  }

  return "researcher";
}
