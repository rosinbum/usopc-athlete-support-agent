#!/usr/bin/env tsx

/**
 * Quality triage CLI — fetches runs from a quality review round, identifies
 * failures, groups them by taxonomy pattern, and creates GitHub issues.
 *
 * Usage:
 *   pnpm --filter @usopc/evals quality:triage -- --tag round-3
 *   pnpm --filter @usopc/evals quality:triage -- --tag round-3 --threshold 0.6
 *   pnpm --filter @usopc/evals quality:triage -- --tag round-3 --dry-run
 */

import { execFileSync } from "node:child_process";
import { getLangSmithClient, QUALITY_REVIEW_PROJECT } from "../config.js";
import { FAILURE_MODES, type FailureCode } from "../quality-review/taxonomy.js";
import {
  extractScores,
  inferFailureCode,
  groupByFailureCode,
  shouldCreateIssue,
  type RunScores,
  type TriageResult,
  type FailureGroup,
} from "../quality-review/triage-rules.js";

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  tag: string;
  threshold: number;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let tag: string | undefined;
  let threshold = 0.5;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tag" && args[i + 1]) {
      tag = args[++i];
    } else if (args[i] === "--threshold" && args[i + 1]) {
      threshold = parseFloat(args[++i]);
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  if (!tag) {
    console.error(
      "Usage: quality:triage -- --tag <tag> [--threshold N] [--dry-run]",
    );
    process.exit(1);
  }

  return { tag, threshold, dryRun };
}

// ---------------------------------------------------------------------------
// LangSmith data fetching
// ---------------------------------------------------------------------------

interface FeedbackStats {
  [key: string]: { avg?: number; mean?: number };
}

async function fetchFailingRuns(
  tag: string,
  threshold: number,
): Promise<TriageResult[]> {
  const client = getLangSmithClient();
  const results: TriageResult[] = [];

  const runs = client.listRuns({
    projectName: QUALITY_REVIEW_PROJECT,
    filter: `has(tags, "${tag}")`,
    isRoot: true,
  });

  for await (const run of runs) {
    const feedbackStats = (run.feedback_stats as FeedbackStats) ?? null;
    const scores = extractScores(feedbackStats);
    const extra = (run.extra ?? {}) as Record<string, unknown>;
    const metadata = (extra.metadata ?? {}) as Record<string, unknown>;

    // Determine triage score (composite or fallback to min quality score)
    const triageScore = scores.triage_score ?? computeFallbackScore(scores);

    // Skip runs above the threshold
    if (triageScore !== null && triageScore >= threshold) continue;

    const category = (metadata.category as string) ?? "";
    const code = inferFailureCode(scores, threshold, category);

    const traceUrl = `https://smith.langchain.com/runs/${run.id}`;

    results.push({
      code,
      meta: {
        scenarioId: (metadata.scenario_id as string) ?? run.name ?? run.id,
        category,
        difficulty: (metadata.difficulty as string) ?? "",
        traceUrl,
        triageScore,
      },
      scores,
    });
  }

  return results;
}

/** Fallback: use minimum of available quality scores. */
function computeFallbackScore(scores: RunScores): number | null {
  const values = [
    scores.accuracy,
    scores.completeness,
    scores.quality,
    scores.helpfulness,
    scores.tone,
  ].filter((v): v is number => v !== null);

  if (values.length === 0) return null;
  return Math.min(...values);
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function printReport(
  groups: FailureGroup[],
  tag: string,
  threshold: number,
  totalFailing: number,
): void {
  console.log(`\n# Quality Triage Report: ${tag}`);
  console.log(`Threshold: ${threshold} | Failing runs: ${totalFailing}\n`);

  if (groups.length === 0) {
    console.log("No failure groups found. All scenarios passed triage.");
    return;
  }

  for (const group of groups) {
    const mode = FAILURE_MODES[group.code];
    const willCreate = shouldCreateIssue(group);
    const marker = willCreate ? "→ Issue" : "  Skip";
    console.log(
      `## [${marker}] ${group.code} — ${mode.label} (${group.severity}, ${group.runs.length} failures)`,
    );
    console.log(`   Node: ${mode.node} | ${mode.description}`);
    console.log();
    console.log(
      "   | Scenario | Category | Triage Score | Key Scores | Trace |",
    );
    console.log("   |---|---|---|---|---|");
    for (const r of group.runs) {
      const keyScores = formatKeyScores(r.scores, group.code);
      const score =
        r.meta.triageScore !== null ? r.meta.triageScore.toFixed(2) : "n/a";
      console.log(
        `   | ${r.meta.scenarioId} | ${r.meta.category} | ${score} | ${keyScores} | [View](${r.meta.traceUrl}) |`,
      );
    }
    console.log();
  }
}

function formatKeyScores(scores: RunScores, code: FailureCode): string {
  const parts: string[] = [];

  if (code.startsWith("DIS_") && scores.disclaimer_present !== null) {
    parts.push(`disclaimer=${scores.disclaimer_present}`);
  }
  if (
    (code.startsWith("CLS_") || code === "RET_IRRELEVANT") &&
    scores.trajectory_match !== null
  ) {
    parts.push(`traj_match=${scores.trajectory_match}`);
  }
  if (scores.accuracy !== null) parts.push(`accuracy=${scores.accuracy}`);
  if (scores.completeness !== null)
    parts.push(`completeness=${scores.completeness}`);
  if (
    scores.tone !== null &&
    (code.includes("TONE") || code === "EMO_TONE_MISS")
  )
    parts.push(`tone=${scores.tone}`);
  if (scores.helpfulness !== null && code === "XCT_GENERIC_RESPONSE")
    parts.push(`helpfulness=${scores.helpfulness}`);

  return parts.slice(0, 4).join(", ");
}

// ---------------------------------------------------------------------------
// GitHub issue creation
// ---------------------------------------------------------------------------

function buildIssueBody(group: FailureGroup, tag: string): string {
  const mode = FAILURE_MODES[group.code];

  const rows = group.runs
    .map((r) => {
      const keyScores = formatKeyScores(r.scores, group.code);
      const score =
        r.meta.triageScore !== null ? r.meta.triageScore.toFixed(2) : "n/a";
      return `| ${r.meta.scenarioId} | ${r.meta.category} | ${score} | ${keyScores} | [View](${r.meta.traceUrl}) |`;
    })
    .join("\n");

  const categories = [...new Set(group.runs.map((r) => r.meta.category))];
  const reproduceCmd = categories
    .map(
      (cat) =>
        `pnpm --filter @usopc/evals quality:run -- --tag ${tag} --category ${cat}`,
    )
    .join("\n");

  return `## Summary
${group.runs.length} scenarios failed with pattern \`${group.code}\` (${mode.label}) during round \`${tag}\`.

**Severity:** ${group.severity} | **Agent Node:** \`${mode.node}\`

## Failing Scenarios
| Scenario | Category | Triage Score | Key Scores | Trace |
|---|---|---|---|---|
${rows}

## Suggested Investigation
- \`packages/core/src/agent/${mode.node}.ts\`
- ${mode.description}

## Reproduce
\`\`\`bash
${reproduceCmd}
\`\`\`

---
*Generated by \`quality:triage\`*`;
}

function createGitHubIssue(group: FailureGroup, tag: string): void {
  const title = `[Quality Triage] ${group.code} - ${group.runs.length} failures in ${tag}`;
  const body = buildIssueBody(group, tag);
  const labels = `bug,quality-triage,severity-${group.severity}`;

  try {
    const result = execFileSync(
      "gh",
      [
        "issue",
        "create",
        "--repo",
        "rosinbum/athlete-support-agent",
        "--title",
        title,
        "--label",
        labels,
        "--body-file",
        "-",
      ],
      {
        input: body,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    console.log(`  ✓ Created issue: ${result.trim()}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to create issue for ${group.code}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!process.env.LANGCHAIN_API_KEY) {
    console.error("✗ LANGCHAIN_API_KEY is not set.");
    process.exit(1);
  }

  const { tag, threshold, dryRun } = parseArgs();

  console.log(
    `Fetching runs from "${QUALITY_REVIEW_PROJECT}" with tag "${tag}"...`,
  );

  const failingRuns = await fetchFailingRuns(tag, threshold);

  if (failingRuns.length === 0) {
    console.log("\nNo failing runs found. All scenarios passed triage.");
    return;
  }

  const groups = groupByFailureCode(failingRuns);

  printReport(groups, tag, threshold, failingRuns.length);

  if (dryRun) {
    const issueGroups = groups.filter(shouldCreateIssue);
    console.log(`\nDry run: would create ${issueGroups.length} GitHub issues.`);
    return;
  }

  const issueGroups = groups.filter(shouldCreateIssue);

  if (issueGroups.length === 0) {
    console.log(
      "\nNo failure groups meet the threshold for issue creation (need 2+ failures, or 1 for critical).",
    );
    return;
  }

  console.log(`\nCreating ${issueGroups.length} GitHub issues...`);
  for (const group of issueGroups) {
    createGitHubIssue(group, tag);
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.stack : error);
  process.exit(1);
});
