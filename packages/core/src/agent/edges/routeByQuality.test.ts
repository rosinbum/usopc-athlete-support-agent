import { describe, it, expect } from "vitest";
import { routeByQuality } from "./routeByQuality.js";
import { makeDefaultState, type AgentState } from "../state.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return makeDefaultState(overrides);
}

describe("routeByQuality", () => {
  it('returns "citationBuilder" when result is undefined', () => {
    const state = makeState({ qualityCheckResult: undefined });
    expect(routeByQuality(state)).toBe("citationBuilder");
  });

  it('returns "citationBuilder" when result passed', () => {
    const state = makeState({
      qualityCheckResult: {
        passed: true,
        score: 0.9,
        issues: [],
        critique: "",
      },
    });
    expect(routeByQuality(state)).toBe("citationBuilder");
  });

  it('returns "synthesizer" when failed and retries remain', () => {
    const state = makeState({
      qualityCheckResult: {
        passed: false,
        score: 0.3,
        issues: [
          {
            type: "generic_response",
            description: "Too generic",
            severity: "major",
          },
        ],
        critique: "Needs more specificity.",
      },
      qualityRetryCount: 0,
      expansionAttempted: false,
      reformulatedQueries: [],
    });
    expect(routeByQuality(state)).toBe("synthesizer");
  });

  it('returns "citationBuilder" when retries exhausted', () => {
    const state = makeState({
      qualityCheckResult: {
        passed: false,
        score: 0.3,
        issues: [
          {
            type: "generic_response",
            description: "Too generic",
            severity: "major",
          },
        ],
        critique: "Needs more specificity.",
      },
      qualityRetryCount: 1, // maxRetries is 1
    });
    expect(routeByQuality(state)).toBe("citationBuilder");
  });
});
