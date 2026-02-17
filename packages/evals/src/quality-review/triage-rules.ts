/**
 * Score-to-failure-code mapping and grouping logic for quality triage.
 *
 * Given a set of online evaluator scores for a run, infers the most likely
 * failure code from the taxonomy. Rules are applied in priority order —
 * the first match wins.
 */

import { FAILURE_MODES, type FailureCode, type Severity } from "./taxonomy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Scores extracted from a run's feedback_stats. All values 0–1 or null. */
export interface RunScores {
  accuracy: number | null;
  completeness: number | null;
  quality: number | null;
  helpfulness: number | null;
  tone: number | null;
  disclaimer_present: number | null;
  trajectory_match: number | null;
  trajectory_subset: number | null;
  triage_score: number | null;
}

/** Metadata about a scenario run, used for grouping and issue creation. */
export interface RunMeta {
  scenarioId: string;
  category: string;
  difficulty: string;
  traceUrl: string;
  triageScore: number | null;
}

/** A failing run with its inferred failure code. */
export interface TriageResult {
  code: FailureCode;
  meta: RunMeta;
  scores: RunScores;
}

/** A group of failures sharing the same failure code. */
export interface FailureGroup {
  code: FailureCode;
  label: string;
  node: string;
  severity: Severity;
  runs: TriageResult[];
}

// ---------------------------------------------------------------------------
// Score extraction
// ---------------------------------------------------------------------------

/** Extract normalized scores from LangSmith feedback_stats. */
export function extractScores(
  feedbackStats: Record<string, { avg?: number; mean?: number }> | null,
): RunScores {
  if (!feedbackStats) {
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
    };
  }

  const get = (key: string): number | null => {
    const stat = feedbackStats[key] ?? feedbackStats[`online_${key}`];
    if (!stat) return null;
    return stat.avg ?? stat.mean ?? null;
  };

  return {
    accuracy: get("accuracy") ?? get("online_accuracy"),
    completeness: get("completeness") ?? get("online_completeness"),
    quality: get("quality") ?? get("online_quality"),
    helpfulness: get("helpfulness") ?? get("online_helpfulness"),
    tone: get("tone") ?? get("online_tone"),
    disclaimer_present:
      get("disclaimer_present") ?? get("online_disclaimer_present"),
    trajectory_match: get("trajectory_match") ?? get("online_trajectory_match"),
    trajectory_subset:
      get("trajectory_subset") ?? get("online_trajectory_subset"),
    triage_score: get("triage_score"),
  };
}

// ---------------------------------------------------------------------------
// Composite triage score
// ---------------------------------------------------------------------------

/**
 * Compute a weighted composite triage score from individual dimension scores.
 * Matches the logic originally planned for the LangSmith online evaluator.
 *
 * - Hard gate: disclaimer_present == 0 → score 0.0
 * - Weighted average: accuracy 30%, completeness 25%, quality 20%, helpfulness 15%, tone 10%
 * - Penalty: both trajectory_match and trajectory_subset == 0 → multiply by 0.8
 */
export function computeTriageScore(scores: RunScores): number | null {
  // Hard gate: missing disclaimer
  if (scores.disclaimer_present === 0) return 0.0;

  const weights: Array<[keyof RunScores, number]> = [
    ["accuracy", 0.3],
    ["completeness", 0.25],
    ["quality", 0.2],
    ["helpfulness", 0.15],
    ["tone", 0.1],
  ];

  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, weight] of weights) {
    const val = scores[key];
    if (val !== null) {
      weightedSum += val * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return null;

  let score = weightedSum / totalWeight;

  // Trajectory penalty
  if (scores.trajectory_match === 0 && scores.trajectory_subset === 0) {
    score *= 0.8;
  }

  return Math.round(score * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Failure inference rules (priority order)
// ---------------------------------------------------------------------------

/**
 * Infer the most likely failure code from a set of scores.
 * Rules are applied in priority order; the first match wins.
 */
export function inferFailureCode(
  scores: RunScores,
  threshold: number,
  category?: string,
): FailureCode {
  const { accuracy, completeness, tone, helpfulness, quality } = scores;
  const disclaimerPresent = scores.disclaimer_present;
  const trajectoryMatch = scores.trajectory_match;
  const trajectorySubset = scores.trajectory_subset;

  const isSafetyCategory =
    category === "emotional_urgent" || category === "boundary";

  // 1. Disclaimer missing + safety category
  if (disclaimerPresent === 0 && isSafetyCategory) {
    return "DIS_MISSING_SAFETY";
  }

  // 2. Disclaimer missing (any category)
  if (disclaimerPresent === 0) {
    return "DIS_MISSING";
  }

  // 3. Both trajectory scores zero + expected escalation category
  if (trajectoryMatch === 0 && trajectorySubset === 0 && isSafetyCategory) {
    return "CLS_MISSED_ESCALATION";
  }

  // 4. Both trajectory scores zero
  if (trajectoryMatch === 0 && trajectorySubset === 0) {
    return "CLS_WRONG_DOMAIN";
  }

  // 5. Trajectory match zero but subset > 0
  if (
    trajectoryMatch === 0 &&
    trajectorySubset !== null &&
    trajectorySubset > 0
  ) {
    return "RET_IRRELEVANT";
  }

  // 6. Very low accuracy — likely hallucination
  if (accuracy !== null && accuracy <= 0.25) {
    return "SYN_HALLUCINATION";
  }

  // 7. Accuracy below threshold
  if (accuracy !== null && accuracy < threshold) {
    return "SYN_INCOMPLETE";
  }

  // 8. Completeness below threshold (accuracy ok)
  if (completeness !== null && completeness < threshold) {
    return "SYN_INCOMPLETE";
  }

  // 9. Tone issue + emotional/urgent category
  if (tone !== null && tone < threshold && category === "emotional_urgent") {
    return "EMO_TONE_MISS";
  }

  // 10. Tone issue (other categories)
  if (tone !== null && tone < threshold) {
    return "SYN_WRONG_TONE";
  }

  // 11. Helpfulness issue (other scores ok)
  if (helpfulness !== null && helpfulness < threshold) {
    return "XCT_GENERIC_RESPONSE";
  }

  // 12. Catch-all: very low quality with no other signal
  if (quality !== null && quality < 0.25) {
    return "SYN_HALLUCINATION";
  }

  // Fallback — shouldn't reach here if the run actually failed triage
  return "SYN_INCOMPLETE";
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** Group triage results by failure code, sorted by severity. */
export function groupByFailureCode(results: TriageResult[]): FailureGroup[] {
  const map = new Map<FailureCode, TriageResult[]>();

  for (const r of results) {
    const list = map.get(r.code) ?? [];
    list.push(r);
    map.set(r.code, list);
  }

  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const groups: FailureGroup[] = [];
  for (const [code, runs] of map) {
    const mode = FAILURE_MODES[code];
    groups.push({
      code,
      label: mode.label,
      node: mode.node,
      severity: mode.severity,
      runs,
    });
  }

  groups.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return groups;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Determine whether a failure group warrants an issue. */
export function shouldCreateIssue(group: FailureGroup): boolean {
  // Critical severity: even 1 failure is enough
  if (group.severity === "critical") return group.runs.length >= 1;
  // Others: at least 2 failing scenarios
  return group.runs.length >= 2;
}
