#!/usr/bin/env tsx

/**
 * Generates a quality review report by aggregating LangSmith feedback from
 * the `usopc-quality-review` project.
 *
 * Usage:
 *   pnpm --filter @usopc/evals quality:report
 *   pnpm --filter @usopc/evals quality:report -- --since 2025-01-15
 *   pnpm --filter @usopc/evals quality:report -- --format json
 */

import { resolveEnv } from "../helpers/resolveEnv.js";

// Bridge SST Resource bindings → env vars before any SDK is loaded
resolveEnv();

import { getLangSmithClient, QUALITY_REVIEW_PROJECT } from "../config.js";
import {
  FEEDBACK_KEYS,
  FAILURE_MODES,
  SCORING_RUBRIC,
  parseFailureCodes,
  type FailureCode,
  type FailureNode,
  type Severity,
} from "../quality-review/taxonomy.js";

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { since?: string; format: "md" | "json" } {
  const args = process.argv.slice(2);
  const result: { since?: string; format: "md" | "json" } = { format: "md" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--since" && args[i + 1]) {
      result.since = args[++i];
    } else if (args[i] === "--format" && args[i + 1]) {
      const fmt = args[++i];
      if (fmt === "json" || fmt === "md") result.format = fmt;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunFeedback {
  runId: string;
  scenarioId?: string;
  category?: string;
  domains?: string[];
  difficulty?: string;
  scores: Record<string, number>;
  failureCodes: FailureCode[];
  notes?: string;
}

interface ReportData {
  totalRuns: number;
  annotatedRuns: number;
  overallScores: Record<string, { mean: number; count: number }>;
  failureFrequency: Array<{
    code: FailureCode;
    label: string;
    severity: Severity;
    node: FailureNode;
    count: number;
  }>;
  failuresByNode: Record<string, number>;
  failuresByDomain: Record<string, number>;
  failuresByCategory: Record<string, number>;
  priorityMatrix: Array<{
    code: FailureCode;
    label: string;
    severity: Severity;
    count: number;
    priority: number;
  }>;
  notesByFailureMode: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

async function collectFeedback(since?: string): Promise<RunFeedback[]> {
  const client = getLangSmithClient();

  // Find the project
  let projectId: string | undefined;
  for await (const project of client.listProjects()) {
    if (project.name === QUALITY_REVIEW_PROJECT) {
      projectId = project.id;
      break;
    }
  }

  if (!projectId) {
    throw new Error(
      `Project "${QUALITY_REVIEW_PROJECT}" not found. Run quality:run first.`,
    );
  }

  // Collect runs and their feedback
  const feedbackByRun: Map<string, RunFeedback> = new Map();

  for await (const run of client.listRuns({
    projectId,
    isRoot: true,
    ...(since ? { startTime: new Date(since) } : {}),
  })) {
    const metadata = (run.extra?.metadata ?? {}) as Record<string, unknown>;
    feedbackByRun.set(run.id, {
      runId: run.id,
      scenarioId: metadata.scenario_id as string | undefined,
      category: metadata.category as string | undefined,
      domains: metadata.domains as string[] | undefined,
      difficulty: metadata.difficulty as string | undefined,
      scores: {},
      failureCodes: [],
    });
  }

  if (feedbackByRun.size === 0) {
    return [];
  }

  // Fetch feedback for all runs
  for (const runId of feedbackByRun.keys()) {
    for await (const fb of client.listFeedback({ runIds: [runId] })) {
      const entry = feedbackByRun.get(runId);
      if (!entry) continue;

      if (
        fb.key === FEEDBACK_KEYS.failureModes &&
        typeof fb.value === "string"
      ) {
        entry.failureCodes = parseFailureCodes(fb.value);
      } else if (
        fb.key === FEEDBACK_KEYS.notes &&
        typeof fb.comment === "string"
      ) {
        entry.notes = fb.comment;
      } else if (typeof fb.score === "number") {
        entry.scores[fb.key] = fb.score;
      }
    }
  }

  return Array.from(feedbackByRun.values());
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function analyze(feedback: RunFeedback[]): ReportData {
  const annotated = feedback.filter(
    (f) => Object.keys(f.scores).length > 0 || f.failureCodes.length > 0,
  );

  // Overall scores
  const overallScores: Record<string, { sum: number; count: number }> = {};
  for (const f of annotated) {
    for (const [key, score] of Object.entries(f.scores)) {
      if (!overallScores[key]) overallScores[key] = { sum: 0, count: 0 };
      overallScores[key].sum += score;
      overallScores[key].count += 1;
    }
  }
  const overallScoresMean: Record<string, { mean: number; count: number }> = {};
  for (const [key, { sum, count }] of Object.entries(overallScores)) {
    overallScoresMean[key] = { mean: sum / count, count };
  }

  // Failure frequency
  const failureCounts: Record<string, number> = {};
  for (const f of annotated) {
    for (const code of f.failureCodes) {
      failureCounts[code] = (failureCounts[code] ?? 0) + 1;
    }
  }
  const failureFrequency = Object.entries(failureCounts)
    .map(([code, count]) => {
      const fm = FAILURE_MODES[code as FailureCode];
      return {
        code: code as FailureCode,
        label: fm.label,
        severity: fm.severity,
        node: fm.node,
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Failures by node
  const failuresByNode: Record<string, number> = {};
  for (const { node, count } of failureFrequency) {
    failuresByNode[node] = (failuresByNode[node] ?? 0) + count;
  }

  // Failures by domain
  const failuresByDomain: Record<string, number> = {};
  for (const f of annotated) {
    if (f.failureCodes.length > 0 && f.domains) {
      for (const domain of f.domains) {
        failuresByDomain[domain] =
          (failuresByDomain[domain] ?? 0) + f.failureCodes.length;
      }
    }
  }

  // Failures by category
  const failuresByCategory: Record<string, number> = {};
  for (const f of annotated) {
    if (f.failureCodes.length > 0 && f.category) {
      failuresByCategory[f.category] =
        (failuresByCategory[f.category] ?? 0) + f.failureCodes.length;
    }
  }

  // Priority matrix: frequency × severity weight
  const priorityMatrix = failureFrequency
    .map((fm) => ({
      code: fm.code,
      label: fm.label,
      severity: fm.severity,
      count: fm.count,
      priority: fm.count * SEVERITY_WEIGHT[fm.severity],
    }))
    .sort((a, b) => b.priority - a.priority);

  // Notes grouped by failure mode
  const notesByFailureMode: Record<string, string[]> = {};
  for (const f of annotated) {
    if (f.notes && f.failureCodes.length > 0) {
      for (const code of f.failureCodes) {
        if (!notesByFailureMode[code]) notesByFailureMode[code] = [];
        notesByFailureMode[code].push(f.notes);
      }
    }
  }

  return {
    totalRuns: feedback.length,
    annotatedRuns: annotated.length,
    overallScores: overallScoresMean,
    failureFrequency,
    failuresByNode,
    failuresByDomain,
    failuresByCategory,
    priorityMatrix,
    notesByFailureMode,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatMarkdown(data: ReportData): string {
  const lines: string[] = [];

  lines.push("# Quality Review Report");
  lines.push("");
  lines.push(
    `**${data.annotatedRuns}** annotated out of **${data.totalRuns}** total runs`,
  );
  lines.push("");

  // Overall scores
  lines.push("## Overall Scores");
  lines.push("");
  lines.push("| Dimension | Mean | Count |");
  lines.push("|-----------|------|-------|");
  for (const dim of SCORING_RUBRIC) {
    const score = data.overallScores[dim.key];
    if (score) {
      lines.push(`| ${dim.name} | ${score.mean.toFixed(2)} | ${score.count} |`);
    }
  }
  lines.push("");

  // Failure mode frequency
  if (data.failureFrequency.length > 0) {
    lines.push("## Failure Mode Frequency");
    lines.push("");
    lines.push("| Code | Label | Severity | Count |");
    lines.push("|------|-------|----------|-------|");
    for (const fm of data.failureFrequency) {
      lines.push(`| ${fm.code} | ${fm.label} | ${fm.severity} | ${fm.count} |`);
    }
    lines.push("");
  }

  // Failures by node
  if (Object.keys(data.failuresByNode).length > 0) {
    lines.push("## Failures by Node");
    lines.push("");
    lines.push("| Node | Total Failures |");
    lines.push("|------|---------------|");
    const sorted = Object.entries(data.failuresByNode).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [node, count] of sorted) {
      lines.push(`| ${node} | ${count} |`);
    }
    lines.push("");
  }

  // Failures by domain
  if (Object.keys(data.failuresByDomain).length > 0) {
    lines.push("## Failures by Domain");
    lines.push("");
    lines.push("| Domain | Total Failures |");
    lines.push("|--------|---------------|");
    const sorted = Object.entries(data.failuresByDomain).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [domain, count] of sorted) {
      lines.push(`| ${domain} | ${count} |`);
    }
    lines.push("");
  }

  // Failures by category
  if (Object.keys(data.failuresByCategory).length > 0) {
    lines.push("## Failures by Scenario Category");
    lines.push("");
    lines.push("| Category | Total Failures |");
    lines.push("|----------|---------------|");
    const sorted = Object.entries(data.failuresByCategory).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [cat, count] of sorted) {
      lines.push(`| ${cat} | ${count} |`);
    }
    lines.push("");
  }

  // Priority matrix
  if (data.priorityMatrix.length > 0) {
    lines.push("## Priority Matrix (Frequency x Severity)");
    lines.push("");
    lines.push("| Code | Label | Severity | Count | Priority |");
    lines.push("|------|-------|----------|-------|----------|");
    for (const item of data.priorityMatrix) {
      lines.push(
        `| ${item.code} | ${item.label} | ${item.severity} | ${item.count} | ${item.priority} |`,
      );
    }
    lines.push("");
  }

  // Detailed notes
  if (Object.keys(data.notesByFailureMode).length > 0) {
    lines.push("## Detailed Notes by Failure Mode");
    lines.push("");
    for (const [code, notes] of Object.entries(data.notesByFailureMode)) {
      const fm = FAILURE_MODES[code as FailureCode];
      lines.push(`### ${code} — ${fm.label}`);
      lines.push("");
      for (const note of notes) {
        lines.push(`- ${note}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { since, format } = parseArgs();

  console.error(
    `Collecting feedback from project "${QUALITY_REVIEW_PROJECT}"...`,
  );
  if (since) console.error(`  Since: ${since}`);

  const feedback = await collectFeedback(since);

  if (feedback.length === 0) {
    throw new Error(
      "No runs found. Run quality:run first, then annotate traces.",
    );
  }

  const report = analyze(feedback);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatMarkdown(report));
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
