import { describe, it, expect } from "vitest";
import {
  extractScores,
  computeTriageScore,
  inferFailureCode,
  groupByFailureCode,
  shouldCreateIssue,
  type RunScores,
  type TriageResult,
  type FailureGroup,
} from "./triage-rules.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scores(overrides: Partial<RunScores> = {}): RunScores {
  return {
    accuracy: null,
    completeness: null,
    quality: null,
    helpfulness: null,
    tone: null,
    disclaimer_present: null,
    trajectory_match: null,
    trajectory_subset: null,
    triage_score: null,
    ...overrides,
  };
}

function triageResult(
  code: TriageResult["code"],
  scenarioId = "test-01",
): TriageResult {
  return {
    code,
    meta: {
      scenarioId,
      category: "sport_specific",
      difficulty: "medium",
      traceUrl: "https://example.com",
      triageScore: 0.5,
    },
    scores: scores(),
  };
}

// ---------------------------------------------------------------------------
// extractScores
// ---------------------------------------------------------------------------

describe("extractScores", () => {
  it("returns all nulls for null input", () => {
    const result = extractScores(null);
    expect(Object.values(result).every((v) => v === null)).toBe(true);
  });

  it("returns all nulls for empty object", () => {
    const result = extractScores({});
    expect(result.accuracy).toBeNull();
    expect(result.tone).toBeNull();
  });

  it("extracts avg values", () => {
    const result = extractScores({
      accuracy: { avg: 0.9 },
      completeness: { avg: 0.8 },
    });
    expect(result.accuracy).toBe(0.9);
    expect(result.completeness).toBe(0.8);
    expect(result.quality).toBeNull();
  });

  it("falls back to mean when avg is missing", () => {
    const result = extractScores({
      accuracy: { mean: 0.7 },
    });
    expect(result.accuracy).toBe(0.7);
  });

  it("handles online_ prefixed keys", () => {
    const result = extractScores({
      online_accuracy: { avg: 0.85 },
    });
    expect(result.accuracy).toBe(0.85);
  });

  it("prefers non-prefixed key over online_ prefix", () => {
    const result = extractScores({
      accuracy: { avg: 0.9 },
      online_accuracy: { avg: 0.5 },
    });
    expect(result.accuracy).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// computeTriageScore
// ---------------------------------------------------------------------------

describe("computeTriageScore", () => {
  it("returns 0.0 when disclaimer_present is 0 (hard gate)", () => {
    expect(
      computeTriageScore(
        scores({
          disclaimer_present: 0,
          accuracy: 1.0,
          quality: 1.0,
        }),
      ),
    ).toBe(0.0);
  });

  it("returns null when all dimension scores are null", () => {
    expect(computeTriageScore(scores())).toBeNull();
  });

  it("computes weighted average from available scores", () => {
    const result = computeTriageScore(
      scores({
        accuracy: 1.0,
        completeness: 1.0,
        quality: 1.0,
        helpfulness: 1.0,
        tone: 1.0,
      }),
    );
    expect(result).toBe(1.0);
  });

  it("uses only available scores when some are null", () => {
    // accuracy(0.3) = 0.8, completeness(0.25) = 0.6 → (0.24 + 0.15) / 0.55
    const result = computeTriageScore(
      scores({ accuracy: 0.8, completeness: 0.6 }),
    );
    expect(result).toBeCloseTo((0.8 * 0.3 + 0.6 * 0.25) / (0.3 + 0.25), 3);
  });

  it("applies trajectory penalty when both trajectory scores are 0", () => {
    const withPenalty = computeTriageScore(
      scores({
        accuracy: 1.0,
        completeness: 1.0,
        quality: 1.0,
        helpfulness: 1.0,
        tone: 1.0,
        trajectory_match: 0,
        trajectory_subset: 0,
      }),
    );
    expect(withPenalty).toBe(0.8);
  });

  it("does not apply penalty when trajectory_match > 0", () => {
    const noPenalty = computeTriageScore(
      scores({
        accuracy: 1.0,
        completeness: 1.0,
        quality: 1.0,
        helpfulness: 1.0,
        tone: 1.0,
        trajectory_match: 1,
        trajectory_subset: 0,
      }),
    );
    expect(noPenalty).toBe(1.0);
  });

  it("does not apply penalty when trajectory scores are null", () => {
    const result = computeTriageScore(
      scores({
        accuracy: 1.0,
        completeness: 1.0,
        quality: 1.0,
        helpfulness: 1.0,
        tone: 1.0,
      }),
    );
    expect(result).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// inferFailureCode
// ---------------------------------------------------------------------------

describe("inferFailureCode", () => {
  const threshold = 0.5;

  it("rule 1: disclaimer=0 + safety category → DIS_MISSING_SAFETY", () => {
    expect(
      inferFailureCode(
        scores({ disclaimer_present: 0 }),
        threshold,
        "emotional_urgent",
      ),
    ).toBe("DIS_MISSING_SAFETY");
    expect(
      inferFailureCode(
        scores({ disclaimer_present: 0 }),
        threshold,
        "boundary",
      ),
    ).toBe("DIS_MISSING_SAFETY");
  });

  it("rule 2: disclaimer=0 + non-safety category → DIS_MISSING", () => {
    expect(
      inferFailureCode(
        scores({ disclaimer_present: 0 }),
        threshold,
        "sport_specific",
      ),
    ).toBe("DIS_MISSING");
  });

  it("rule 3: both trajectory=0 + safety category → CLS_MISSED_ESCALATION", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 1,
          trajectory_match: 0,
          trajectory_subset: 0,
        }),
        threshold,
        "emotional_urgent",
      ),
    ).toBe("CLS_MISSED_ESCALATION");
  });

  it("rule 4: both trajectory=0 + non-safety → CLS_WRONG_DOMAIN", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 1,
          trajectory_match: 0,
          trajectory_subset: 0,
        }),
        threshold,
        "sport_specific",
      ),
    ).toBe("CLS_WRONG_DOMAIN");
  });

  it("rule 5: trajectory_match=0 but subset>0 → RET_IRRELEVANT", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 1,
          trajectory_match: 0,
          trajectory_subset: 0.5,
        }),
        threshold,
      ),
    ).toBe("RET_IRRELEVANT");
  });

  it("rule 6: very low accuracy (<=0.25) → SYN_HALLUCINATION", () => {
    expect(
      inferFailureCode(
        scores({ disclaimer_present: 1, trajectory_match: 1, accuracy: 0.2 }),
        threshold,
      ),
    ).toBe("SYN_HALLUCINATION");
  });

  it("rule 7: accuracy below threshold → SYN_INCOMPLETE", () => {
    expect(
      inferFailureCode(
        scores({ disclaimer_present: 1, trajectory_match: 1, accuracy: 0.4 }),
        threshold,
      ),
    ).toBe("SYN_INCOMPLETE");
  });

  it("rule 8: completeness below threshold → SYN_INCOMPLETE", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 1,
          trajectory_match: 1,
          accuracy: 0.8,
          completeness: 0.3,
        }),
        threshold,
      ),
    ).toBe("SYN_INCOMPLETE");
  });

  it("rule 9: low tone + emotional_urgent → EMO_TONE_MISS", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 1,
          trajectory_match: 1,
          accuracy: 0.8,
          completeness: 0.8,
          tone: 0.3,
        }),
        threshold,
        "emotional_urgent",
      ),
    ).toBe("EMO_TONE_MISS");
  });

  it("rule 10: low tone + non-emotional → SYN_WRONG_TONE", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 1,
          trajectory_match: 1,
          accuracy: 0.8,
          completeness: 0.8,
          tone: 0.3,
        }),
        threshold,
        "sport_specific",
      ),
    ).toBe("SYN_WRONG_TONE");
  });

  it("rule 11: low helpfulness → XCT_GENERIC_RESPONSE", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 1,
          trajectory_match: 1,
          accuracy: 0.8,
          completeness: 0.8,
          tone: 0.8,
          helpfulness: 0.3,
        }),
        threshold,
      ),
    ).toBe("XCT_GENERIC_RESPONSE");
  });

  it("rule 12: very low quality catch-all → SYN_HALLUCINATION", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 1,
          trajectory_match: 1,
          accuracy: 0.8,
          completeness: 0.8,
          tone: 0.8,
          helpfulness: 0.8,
          quality: 0.2,
        }),
        threshold,
      ),
    ).toBe("SYN_HALLUCINATION");
  });

  it("fallback: all scores above threshold → SYN_INCOMPLETE", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 1,
          trajectory_match: 1,
          accuracy: 0.8,
          completeness: 0.8,
          tone: 0.8,
          helpfulness: 0.8,
          quality: 0.8,
        }),
        threshold,
      ),
    ).toBe("SYN_INCOMPLETE");
  });

  it("priority: disclaimer=0 takes precedence over trajectory=0", () => {
    expect(
      inferFailureCode(
        scores({
          disclaimer_present: 0,
          trajectory_match: 0,
          trajectory_subset: 0,
        }),
        threshold,
        "emotional_urgent",
      ),
    ).toBe("DIS_MISSING_SAFETY");
  });
});

// ---------------------------------------------------------------------------
// groupByFailureCode
// ---------------------------------------------------------------------------

describe("groupByFailureCode", () => {
  it("returns empty array for empty input", () => {
    expect(groupByFailureCode([])).toEqual([]);
  });

  it("groups results by failure code", () => {
    const results = [
      triageResult("DIS_MISSING", "s1"),
      triageResult("DIS_MISSING", "s2"),
      triageResult("SYN_HALLUCINATION", "s3"),
    ];
    const groups = groupByFailureCode(results);
    expect(groups).toHaveLength(2);
    const disMissing = groups.find((g) => g.code === "DIS_MISSING");
    expect(disMissing?.runs).toHaveLength(2);
  });

  it("sorts groups by severity (critical first)", () => {
    const results = [
      triageResult("SYN_WRONG_TONE"), // medium
      triageResult("DIS_MISSING_SAFETY"), // critical
      triageResult("RET_IRRELEVANT"), // high
    ];
    const groups = groupByFailureCode(results);
    expect(groups[0]!.severity).toBe("critical");
    expect(groups[1]!.severity).toBe("high");
    expect(groups[2]!.severity).toBe("medium");
  });

  it("populates label, node, and severity from taxonomy", () => {
    const groups = groupByFailureCode([triageResult("DIS_MISSING")]);
    expect(groups[0]!.label).toBeTruthy();
    expect(groups[0]!.node).toBeTruthy();
    expect(groups[0]!.severity).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// shouldCreateIssue
// ---------------------------------------------------------------------------

describe("shouldCreateIssue", () => {
  it("returns true for critical severity with 1 run", () => {
    const group: FailureGroup = {
      code: "DIS_MISSING_SAFETY",
      label: "test",
      node: "disclaimerGuard",
      severity: "critical",
      runs: [triageResult("DIS_MISSING_SAFETY")],
    };
    expect(shouldCreateIssue(group)).toBe(true);
  });

  it("returns false for non-critical with 1 run", () => {
    const group: FailureGroup = {
      code: "SYN_INCOMPLETE",
      label: "test",
      node: "synthesizer",
      severity: "medium",
      runs: [triageResult("SYN_INCOMPLETE")],
    };
    expect(shouldCreateIssue(group)).toBe(false);
  });

  it("returns true for non-critical with 2+ runs", () => {
    const group: FailureGroup = {
      code: "SYN_INCOMPLETE",
      label: "test",
      node: "synthesizer",
      severity: "medium",
      runs: [
        triageResult("SYN_INCOMPLETE", "s1"),
        triageResult("SYN_INCOMPLETE", "s2"),
      ],
    };
    expect(shouldCreateIssue(group)).toBe(true);
  });
});
