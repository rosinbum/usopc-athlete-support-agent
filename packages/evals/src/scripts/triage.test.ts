import { describe, it, expect } from "vitest";
import {
  extractScores,
  computeTriageScore,
  inferFailureCode,
  groupByFailureCode,
  shouldCreateIssue,
  type RunScores,
  type TriageResult,
} from "../quality-review/triage-rules.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScores(overrides: Partial<RunScores> = {}): RunScores {
  return {
    accuracy: 0.75,
    completeness: 0.75,
    quality: 0.75,
    helpfulness: 0.75,
    tone: 0.75,
    disclaimer_present: 1,
    trajectory_match: 1,
    trajectory_subset: 1,
    triage_score: null,
    ...overrides,
  };
}

function makeResult(
  code: string,
  overrides: Partial<TriageResult["meta"]> = {},
): TriageResult {
  return {
    code: code as TriageResult["code"],
    meta: {
      scenarioId: "test-01",
      category: "sport_specific",
      difficulty: "medium",
      traceUrl: "https://example.com/trace",
      triageScore: 0.3,
      ...overrides,
    },
    scores: makeScores(),
  };
}

// ---------------------------------------------------------------------------
// extractScores
// ---------------------------------------------------------------------------

describe("extractScores", () => {
  it("returns nulls for null input", () => {
    const scores = extractScores(null);
    expect(scores.accuracy).toBeNull();
    expect(scores.triage_score).toBeNull();
  });

  it("extracts scores from feedback_stats with avg", () => {
    const stats = {
      accuracy: { avg: 0.8 },
      completeness: { avg: 0.6 },
      quality: { avg: 0.7 },
      helpfulness: { avg: 0.9 },
      tone: { avg: 0.5 },
      disclaimer_present: { avg: 1 },
      trajectory_match: { avg: 0 },
      trajectory_subset: { avg: 0.5 },
      triage_score: { avg: 0.42 },
    };
    const scores = extractScores(stats);
    expect(scores.accuracy).toBe(0.8);
    expect(scores.trajectory_match).toBe(0);
    expect(scores.triage_score).toBe(0.42);
  });

  it("handles online_ prefixed keys", () => {
    const stats = {
      online_accuracy: { avg: 0.3 },
      online_disclaimer_present: { avg: 0 },
    };
    const scores = extractScores(stats);
    expect(scores.accuracy).toBe(0.3);
    expect(scores.disclaimer_present).toBe(0);
  });

  it("prefers non-prefixed keys over online_ prefixed", () => {
    const stats = {
      accuracy: { avg: 0.9 },
      online_accuracy: { avg: 0.1 },
    };
    const scores = extractScores(stats);
    expect(scores.accuracy).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// computeTriageScore
// ---------------------------------------------------------------------------

describe("computeTriageScore", () => {
  it("returns 0.0 when disclaimer_present is 0", () => {
    const scores = makeScores({ disclaimer_present: 0 });
    expect(computeTriageScore(scores)).toBe(0.0);
  });

  it("returns null when all dimension scores are null", () => {
    const scores = makeScores({
      accuracy: null,
      completeness: null,
      quality: null,
      helpfulness: null,
      tone: null,
    });
    expect(computeTriageScore(scores)).toBeNull();
  });

  it("computes weighted average of available scores", () => {
    // All scores 0.8, all weights sum to 1.0 → result should be 0.8
    const scores = makeScores({
      accuracy: 0.8,
      completeness: 0.8,
      quality: 0.8,
      helpfulness: 0.8,
      tone: 0.8,
    });
    expect(computeTriageScore(scores)).toBe(0.8);
  });

  it("applies trajectory penalty when both are 0", () => {
    const scores = makeScores({
      accuracy: 1.0,
      completeness: 1.0,
      quality: 1.0,
      helpfulness: 1.0,
      tone: 1.0,
      trajectory_match: 0,
      trajectory_subset: 0,
    });
    expect(computeTriageScore(scores)).toBe(0.8);
  });

  it("does not apply trajectory penalty when only one is 0", () => {
    const scores = makeScores({
      accuracy: 1.0,
      completeness: 1.0,
      quality: 1.0,
      helpfulness: 1.0,
      tone: 1.0,
      trajectory_match: 0,
      trajectory_subset: 0.5,
    });
    expect(computeTriageScore(scores)).toBe(1.0);
  });

  it("handles partial scores (some null)", () => {
    // Only accuracy (weight 0.3) and completeness (weight 0.25) present
    const scores = makeScores({
      accuracy: 0.6,
      completeness: 0.4,
      quality: null,
      helpfulness: null,
      tone: null,
    });
    // weighted = (0.6*0.3 + 0.4*0.25) / (0.3+0.25) = (0.18+0.10)/0.55 ≈ 0.5091
    const result = computeTriageScore(scores)!;
    expect(result).toBeCloseTo(0.5091, 3);
  });
});

// ---------------------------------------------------------------------------
// inferFailureCode
// ---------------------------------------------------------------------------

describe("inferFailureCode", () => {
  const threshold = 0.5;

  it("returns DIS_MISSING_SAFETY for disclaimer=0 + safety category", () => {
    const scores = makeScores({ disclaimer_present: 0 });
    expect(inferFailureCode(scores, threshold, "emotional_urgent")).toBe(
      "DIS_MISSING_SAFETY",
    );
    expect(inferFailureCode(scores, threshold, "boundary")).toBe(
      "DIS_MISSING_SAFETY",
    );
  });

  it("returns DIS_MISSING for disclaimer=0 + non-safety category", () => {
    const scores = makeScores({ disclaimer_present: 0 });
    expect(inferFailureCode(scores, threshold, "sport_specific")).toBe(
      "DIS_MISSING",
    );
  });

  it("returns CLS_MISSED_ESCALATION for both trajectory=0 + safety category", () => {
    const scores = makeScores({
      trajectory_match: 0,
      trajectory_subset: 0,
    });
    expect(inferFailureCode(scores, threshold, "emotional_urgent")).toBe(
      "CLS_MISSED_ESCALATION",
    );
  });

  it("returns CLS_WRONG_DOMAIN for both trajectory=0 + non-safety category", () => {
    const scores = makeScores({
      trajectory_match: 0,
      trajectory_subset: 0,
    });
    expect(inferFailureCode(scores, threshold, "sport_specific")).toBe(
      "CLS_WRONG_DOMAIN",
    );
  });

  it("returns RET_IRRELEVANT for trajectory_match=0 but subset > 0", () => {
    const scores = makeScores({
      trajectory_match: 0,
      trajectory_subset: 0.5,
    });
    expect(inferFailureCode(scores, threshold)).toBe("RET_IRRELEVANT");
  });

  it("returns SYN_HALLUCINATION for accuracy <= 0.25", () => {
    const scores = makeScores({ accuracy: 0.25 });
    expect(inferFailureCode(scores, threshold)).toBe("SYN_HALLUCINATION");
  });

  it("returns SYN_INCOMPLETE for accuracy below threshold but > 0.25", () => {
    const scores = makeScores({ accuracy: 0.4 });
    expect(inferFailureCode(scores, threshold)).toBe("SYN_INCOMPLETE");
  });

  it("returns SYN_INCOMPLETE for completeness below threshold (accuracy ok)", () => {
    const scores = makeScores({ accuracy: 0.8, completeness: 0.3 });
    expect(inferFailureCode(scores, threshold)).toBe("SYN_INCOMPLETE");
  });

  it("returns EMO_TONE_MISS for tone below threshold + emotional_urgent", () => {
    const scores = makeScores({ tone: 0.2 });
    expect(inferFailureCode(scores, threshold, "emotional_urgent")).toBe(
      "EMO_TONE_MISS",
    );
  });

  it("returns SYN_WRONG_TONE for tone below threshold + non-emotional category", () => {
    const scores = makeScores({ tone: 0.2 });
    expect(inferFailureCode(scores, threshold, "sport_specific")).toBe(
      "SYN_WRONG_TONE",
    );
  });

  it("returns XCT_GENERIC_RESPONSE for helpfulness below threshold (others ok)", () => {
    const scores = makeScores({ helpfulness: 0.3 });
    expect(inferFailureCode(scores, threshold)).toBe("XCT_GENERIC_RESPONSE");
  });

  it("returns SYN_HALLUCINATION for quality < 0.25 as catch-all", () => {
    const scores = makeScores({
      accuracy: null,
      completeness: null,
      tone: null,
      helpfulness: null,
      quality: 0.2,
      trajectory_match: null,
      trajectory_subset: null,
      disclaimer_present: null,
    });
    expect(inferFailureCode(scores, threshold)).toBe("SYN_HALLUCINATION");
  });

  it("respects priority order — disclaimer before trajectory", () => {
    const scores = makeScores({
      disclaimer_present: 0,
      trajectory_match: 0,
      trajectory_subset: 0,
    });
    expect(inferFailureCode(scores, threshold, "emotional_urgent")).toBe(
      "DIS_MISSING_SAFETY",
    );
  });
});

// ---------------------------------------------------------------------------
// groupByFailureCode
// ---------------------------------------------------------------------------

describe("groupByFailureCode", () => {
  it("groups results by code", () => {
    const results: TriageResult[] = [
      makeResult("SYN_HALLUCINATION", { scenarioId: "a" }),
      makeResult("SYN_HALLUCINATION", { scenarioId: "b" }),
      makeResult("DIS_MISSING", { scenarioId: "c" }),
    ];
    const groups = groupByFailureCode(results);
    expect(groups).toHaveLength(2);
  });

  it("sorts by severity (critical first)", () => {
    const results: TriageResult[] = [
      makeResult("SYN_WRONG_TONE"), // medium
      makeResult("DIS_MISSING_SAFETY"), // critical
      makeResult("SYN_INCOMPLETE"), // high
    ];
    const groups = groupByFailureCode(results);
    expect(groups[0].code).toBe("DIS_MISSING_SAFETY");
    expect(groups[1].code).toBe("SYN_INCOMPLETE");
    expect(groups[2].code).toBe("SYN_WRONG_TONE");
  });
});

// ---------------------------------------------------------------------------
// shouldCreateIssue
// ---------------------------------------------------------------------------

describe("shouldCreateIssue", () => {
  it("creates issue for critical severity with 1 failure", () => {
    const group = groupByFailureCode([makeResult("DIS_MISSING_SAFETY")])[0];
    expect(shouldCreateIssue(group)).toBe(true);
  });

  it("does not create issue for high severity with 1 failure", () => {
    const group = groupByFailureCode([makeResult("SYN_INCOMPLETE")])[0];
    expect(shouldCreateIssue(group)).toBe(false);
  });

  it("creates issue for high severity with 2+ failures", () => {
    const group = groupByFailureCode([
      makeResult("SYN_INCOMPLETE", { scenarioId: "a" }),
      makeResult("SYN_INCOMPLETE", { scenarioId: "b" }),
    ])[0];
    expect(shouldCreateIssue(group)).toBe(true);
  });
});
