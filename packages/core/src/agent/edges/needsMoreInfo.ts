import { RETRIEVAL_CONFIG } from "../../config/index.js";
import type { AgentState } from "../state.js";

/**
 * Conditional edge after RETRIEVER.
 *
 * Routes based on retrieval confidence:
 * - High confidence (>= threshold) -> synthesizer
 * - Low confidence (< threshold) -> researcher (web search fallback)
 */
export function needsMoreInfo(
  state: AgentState,
): "synthesizer" | "researcher" {
  if (state.retrievalConfidence >= RETRIEVAL_CONFIG.confidenceThreshold) {
    return "synthesizer";
  }

  // If we already have web search results, go to synthesizer anyway
  if (state.webSearchResults.length > 0) {
    return "synthesizer";
  }

  return "researcher";
}
