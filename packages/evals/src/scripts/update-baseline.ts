#!/usr/bin/env tsx

/**
 * Snapshots the latest eval scores as the new baseline.
 *
 * Reads the most recent experiment run from LangSmith for each evaluator,
 * computes mean scores, and writes to baselines/scores.json.
 *
 * Usage: pnpm --filter @usopc/evals exec tsx src/scripts/update-baseline.ts
 *        pnpm --filter @usopc/evals exec tsx src/scripts/update-baseline.ts -- --version v1.2.0
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINES_PATH = path.resolve(__dirname, "../../baselines/scores.json");

/** All feedback keys tracked in baselines. */
const FEEDBACK_KEYS = [
  // Classifier
  "topic_domain_accuracy",
  "query_intent_accuracy",
  "ngb_detection_jaccard",
  "escalation_accuracy",
  "clarification_accuracy",
  // Escalation
  "route_correct",
  "target_correct",
  "urgency_correct",
  "contact_info_present",
  // Trajectory
  "trajectory_strict_match",
  "trajectory_subset_match",
  "path_type_correct",
  // Disclaimers
  "disclaimer_present",
  "disclaimer_correct_domain",
  "disclaimer_safety_info",
  // Citations
  "citations_present",
  "citations_have_urls",
  "citations_have_snippets",
  // LLM judge
  "correctness",
  "conciseness",
  "groundedness",
  // Semantic similarity
  "semantic_similarity",
];

interface BaselineScores {
  version: string;
  date: string;
  evaluators: Record<string, { mean: number | null }>;
}

function parseArgs(): { version: string } {
  const args = process.argv.slice(2);
  const versionIdx = args.indexOf("--version");
  const version =
    versionIdx >= 0 && versionIdx + 1 < args.length
      ? args[versionIdx + 1]!
      : "snapshot";
  return { version };
}

/**
 * Reads vitest JSON output from stdin or a file and extracts feedback scores.
 * Expected format: newline-delimited JSON with { key, score } pairs.
 */
function readScoresFromFile(filePath: string): Map<string, number[]> {
  const scores = new Map<string, number[]>();
  const content = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(content);

  // Support format: { results: { key: { scores: number[] } } }
  if (data.results) {
    for (const [key, entry] of Object.entries(
      data.results as Record<string, { scores: number[] }>,
    )) {
      if (FEEDBACK_KEYS.includes(key) && Array.isArray(entry.scores)) {
        scores.set(key, entry.scores);
      }
    }
  }

  return scores;
}

function computeMeans(
  scores: Map<string, number[]>,
): Record<string, { mean: number | null }> {
  const evaluators: Record<string, { mean: number | null }> = {};
  for (const key of FEEDBACK_KEYS) {
    const values = scores.get(key);
    if (values && values.length > 0) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      evaluators[key] = { mean: Math.round(mean * 1000) / 1000 };
    } else {
      evaluators[key] = { mean: null };
    }
  }
  return evaluators;
}

function main(): void {
  const { version } = parseArgs();

  const inputFile = process.argv.find(
    (a) => a.endsWith(".json") && !a.startsWith("--"),
  );
  if (!inputFile) {
    console.error(
      "Usage: update-baseline.ts [--version vX.Y.Z] <scores-file.json>",
    );
    process.exit(1);
  }

  const scores = readScoresFromFile(inputFile);
  const evaluators = computeMeans(scores);

  const baseline: BaselineScores = {
    version,
    date: new Date().toISOString().slice(0, 10),
    evaluators,
  };

  fs.writeFileSync(BASELINES_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`Baseline updated: ${BASELINES_PATH}`);
  console.log(`  Version: ${version}`);
  console.log(`  Keys with scores: ${scores.size}/${FEEDBACK_KEYS.length}`);
}

main();
