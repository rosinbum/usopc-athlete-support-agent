import { RETRIEVAL_CONFIG } from "../../config/index.js";
import type { AgentState } from "../state.js";

/**
 * Creates a conditional edge function after RETRIEVER.
 *
 * @param expansionEnabled  When true, routes to the retrieval expander
 *   before falling back to the researcher (web search).
 * @param parallelResearchEnabled  When true, gray-zone confidence
 *   (>= threshold but < grayZoneUpperThreshold) routes to the researcher
 *   so web search results supplement borderline retrieval.
 *
 * Routes based on retrieval confidence:
 * - High confidence (>= grayZoneUpperThreshold) -> synthesizer
 * - Gray-zone confidence ([threshold, grayZoneUpperThreshold)) + parallelResearch + no web results -> researcher
 * - Confidence >= threshold (flag off or web results exist) -> synthesizer
 * - Low confidence, web results exist -> synthesizer
 * - Low confidence, expansion not yet attempted (flag on) -> retrievalExpander
 * - Low confidence, expansion done or flag off -> researcher
 */
export function createNeedsMoreInfo(
  expansionEnabled: boolean,
  parallelResearchEnabled: boolean,
) {
  return function needsMoreInfo(
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
    if (
      parallelResearchEnabled &&
      state.retrievalConfidence >= confidenceThreshold
    ) {
      return "researcher";
    }

    // At or above threshold with flag off — preserve original behavior
    if (state.retrievalConfidence >= confidenceThreshold) {
      return "synthesizer";
    }

    // Low confidence — try expansion first if available
    if (expansionEnabled && !state.expansionAttempted) {
      return "retrievalExpander";
    }

    return "researcher";
  };
}

/**
 * Backward-compatible export: needsMoreInfo without expansion or parallel research.
 */
export function needsMoreInfo(state: AgentState): "synthesizer" | "researcher" {
  return createNeedsMoreInfo(false, false)(state) as
    | "synthesizer"
    | "researcher";
}
