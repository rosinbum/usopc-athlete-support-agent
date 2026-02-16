import { QUALITY_CHECKER_CONFIG } from "../../config/index.js";
import type { AgentState } from "../state.js";

/**
 * Routes from the quality checker to either citationBuilder (pass) or
 * synthesizer (retry). Falls through to citationBuilder when:
 * - No quality check result (shouldn't happen, but fail-open)
 * - Quality check passed
 * - Max retries exhausted
 */
export function routeByQuality(
  state: AgentState,
): "citationBuilder" | "synthesizer" {
  const result = state.qualityCheckResult;

  if (!result || result.passed) {
    return "citationBuilder";
  }

  if (state.qualityRetryCount >= QUALITY_CHECKER_CONFIG.maxRetries) {
    return "citationBuilder";
  }

  return "synthesizer";
}
