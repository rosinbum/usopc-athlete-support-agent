import { RETRIEVAL_CONFIG } from "../../config/index.js";
import type { AgentState } from "../state.js";

/**
 * Creates a conditional edge function after RETRIEVER.
 *
 * When `expansionEnabled` is true, routes to the retrieval expander
 * before falling back to the researcher (web search).
 *
 * Routes based on retrieval confidence:
 * - High confidence (>= threshold) -> synthesizer
 * - Low confidence, web results exist -> synthesizer
 * - Low confidence, expansion not yet attempted (flag on) -> retrievalExpander
 * - Low confidence, expansion done or flag off -> researcher
 */
export function createNeedsMoreInfo(expansionEnabled: boolean) {
  return function needsMoreInfo(
    state: AgentState,
  ): "synthesizer" | "researcher" | "retrievalExpander" {
    if (state.retrievalConfidence >= RETRIEVAL_CONFIG.confidenceThreshold) {
      return "synthesizer";
    }

    // If we already have web search results, go to synthesizer anyway
    if (state.webSearchResults.length > 0) {
      return "synthesizer";
    }

    if (expansionEnabled && !state.expansionAttempted) {
      return "retrievalExpander";
    }

    return "researcher";
  };
}

/**
 * Backward-compatible export: needsMoreInfo without expansion support.
 */
export function needsMoreInfo(state: AgentState): "synthesizer" | "researcher" {
  return createNeedsMoreInfo(false)(state) as "synthesizer" | "researcher";
}
