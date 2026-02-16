#!/usr/bin/env tsx

/**
 * Automated evaluation of quality review traces.
 *
 * Fetches root runs from the `usopc-quality-review` LangSmith project,
 * compares trajectories and answer content against expected values stored
 * in trace metadata, and posts feedback scores back to LangSmith.
 *
 * Usage:
 *   pnpm --filter @usopc/evals quality:evaluate
 *   pnpm --filter @usopc/evals quality:evaluate -- --since 2026-02-15T00:00:00Z
 *   pnpm --filter @usopc/evals quality:evaluate -- --tag round-2
 */

import { resolveEnv } from "../helpers/resolveEnv.js";

// Bridge SST Resource bindings → env vars before any SDK is loaded
resolveEnv();

import { getLangSmithClient, QUALITY_REVIEW_PROJECT } from "../config.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Separator used by the disclaimerGuard node. */
const DISCLAIMER_SEPARATOR = "\n\n---\n\n";

/** Patterns that indicate a safety disclaimer is present. */
const DISCLAIMER_CONTACT_PATTERN =
  /ombudsman|safesport|1-833-5US-SAFE|833-587-7233|usada|uscenterforsafesport/i;

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { since?: string; tag?: string } {
  const args = process.argv.slice(2);
  const result: { since?: string; tag?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--since" && args[i + 1]) {
      result.since = args[++i];
    } else if (args[i] === "--tag" && args[i + 1]) {
      result.tag = args[++i];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvalResult {
  runId: string;
  scenarioId: string;
  scores: Record<string, number | null>;
}

// ---------------------------------------------------------------------------
// Evaluator functions
// ---------------------------------------------------------------------------

/**
 * Strict trajectory match: actual must be identical to expected.
 */
function trajectoryMatch(
  actual: string[],
  expected: string[],
): { match: boolean; subset: boolean } {
  const match =
    actual.length === expected.length &&
    actual.every((node, i) => node === expected[i]);

  // Subset match: all expected nodes appear in actual in order
  let subsetIdx = 0;
  for (const node of actual) {
    if (subsetIdx < expected.length && node === expected[subsetIdx]) {
      subsetIdx++;
    }
  }
  const subset = subsetIdx === expected.length;

  return { match, subset };
}

/**
 * Check if the answer contains a disclaimer separator and contact info.
 */
function disclaimerPresent(answer: string): boolean {
  const hasSeparator = answer.includes(DISCLAIMER_SEPARATOR);
  const hasContact = DISCLAIMER_CONTACT_PATTERN.test(answer);
  return hasSeparator && hasContact;
}

/**
 * Compute coverage of required facts in the answer using case-insensitive
 * substring matching.
 */
function factCoverage(answer: string, requiredFacts: string[]): number {
  if (requiredFacts.length === 0) return 1.0;
  const lower = answer.toLowerCase();
  const found = requiredFacts.filter((fact) =>
    lower.includes(fact.toLowerCase()),
  );
  return found.length / requiredFacts.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { since, tag } = parseArgs();
  const client = getLangSmithClient();

  console.log(`Evaluating traces from project "${QUALITY_REVIEW_PROJECT}"...`);
  if (since) console.log(`  Since: ${since}`);
  if (tag) console.log(`  Tag: ${tag}`);
  console.log();

  // Find the project
  let projectId: string | undefined;
  for await (const project of client.listProjects()) {
    if (project.name === QUALITY_REVIEW_PROJECT) {
      projectId = project.id;
      break;
    }
  }

  if (!projectId) {
    console.error(
      `Project "${QUALITY_REVIEW_PROJECT}" not found. Run quality:run first.`,
    );
    process.exit(1);
  }

  // Fetch root runs
  const runs: Array<{
    id: string;
    metadata: Record<string, unknown>;
    outputs: Record<string, unknown> | null;
    tags: string[];
  }> = [];

  for await (const run of client.listRuns({
    projectId,
    isRoot: true,
    ...(since ? { startTime: new Date(since) } : {}),
  })) {
    const metadata = (run.extra?.metadata ?? {}) as Record<string, unknown>;
    const runTags = (run.tags ?? []) as string[];

    // If a tag filter is specified, skip runs that don't have it
    if (tag && !runTags.includes(tag)) continue;

    runs.push({
      id: run.id,
      metadata,
      outputs: (run.outputs ?? null) as Record<string, unknown> | null,
      tags: runTags,
    });
  }

  if (runs.length === 0) {
    console.error("No matching runs found.");
    if (tag) console.error(`  (filtered by tag: ${tag})`);
    if (since) console.error(`  (filtered by since: ${since})`);
    process.exit(1);
  }

  console.log(`Found ${runs.length} runs to evaluate.`);
  console.log();

  // Evaluate each run and post feedback
  const results: EvalResult[] = [];

  for (const run of runs) {
    const scenarioId = (run.metadata.scenario_id as string) ?? "unknown";
    const answer = (run.outputs?.answer as string) ?? "";
    const trajectory = (run.outputs?.trajectory as string[]) ?? [];
    const expectedPath = run.metadata.expected_path as string | undefined;
    const requiredFacts = run.metadata.required_facts as string[] | undefined;

    const scores: Record<string, number | null> = {};

    // --- Trajectory matching ---
    if (expectedPath) {
      const expectedNodes = expectedPath.split(" → ");
      const { match, subset } = trajectoryMatch(trajectory, expectedNodes);
      scores.auto_trajectory_match = match ? 1.0 : 0.0;
      scores.auto_trajectory_subset = subset ? 1.0 : 0.0;
    } else {
      scores.auto_trajectory_match = null;
      scores.auto_trajectory_subset = null;
    }

    // --- Disclaimer check ---
    // Clarification responses don't need disclaimers
    const isClarify = trajectory.includes("clarify");
    scores.auto_disclaimer_present = isClarify
      ? 1.0
      : disclaimerPresent(answer)
        ? 1.0
        : 0.0;

    // --- Fact coverage ---
    if (requiredFacts && requiredFacts.length > 0) {
      scores.auto_fact_coverage = factCoverage(answer, requiredFacts);
    } else {
      scores.auto_fact_coverage = null;
    }

    // Post feedback to LangSmith
    for (const [key, score] of Object.entries(scores)) {
      if (score === null) continue;
      await client.createFeedback(run.id, key, { score });
    }

    results.push({ runId: run.id, scenarioId, scores });

    const status = Object.values(scores).every((s) => s === null || s === 1.0)
      ? "✓"
      : "✗";
    const details = Object.entries(scores)
      .filter(([, s]) => s !== null)
      .map(([k, s]) => `${k.replace("auto_", "")}=${s!.toFixed(1)}`)
      .join(", ");
    console.log(`  ${status} [${scenarioId}] ${details}`);
  }

  // Print summary
  console.log();
  printSummary(results);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(results: EvalResult[]): void {
  const keys = [
    "auto_trajectory_match",
    "auto_trajectory_subset",
    "auto_disclaimer_present",
    "auto_fact_coverage",
  ];

  console.log("Summary");
  console.log("=".repeat(60));
  console.log();

  for (const key of keys) {
    const applicable = results.filter((r) => r.scores[key] !== null);
    if (applicable.length === 0) {
      console.log(`  ${key}: n/a (no applicable runs)`);
      continue;
    }
    const scores = applicable.map((r) => r.scores[key]!);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const perfect = scores.filter((s) => s === 1.0).length;
    console.log(
      `  ${key}: ${mean.toFixed(2)} avg (${perfect}/${applicable.length} perfect)`,
    );
  }

  console.log();
  console.log(
    `Evaluated ${results.length} runs. Feedback posted to LangSmith.`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.stack : error);
  process.exit(1);
});
