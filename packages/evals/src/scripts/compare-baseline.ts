#!/usr/bin/env tsx

/**
 * Compares eval scores against the stored baseline and detects regressions.
 *
 * Exit codes:
 *   0 — no regressions
 *   1 — regressions detected (>10% mean drop on any evaluator)
 *
 * Usage:
 *   tsx compare-baseline.ts <current-scores.json>
 *   tsx compare-baseline.ts <current-scores.json> --output regressions.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINES_PATH = path.resolve(__dirname, "../../baselines/scores.json");

interface BaselineEntry {
  mean: number | null;
}

interface Baseline {
  version: string;
  date: string;
  evaluators: Record<string, BaselineEntry>;
}

export interface Regression {
  key: string;
  baseline: number;
  current: number;
  delta: number;
  severity: "warning" | "fail";
}

export interface ComparisonResult {
  baselineVersion: string;
  regressions: Regression[];
  improvements: Array<{
    key: string;
    baseline: number;
    current: number;
    delta: number;
  }>;
  hasFailed: boolean;
}

function loadBaseline(): Baseline {
  const content = fs.readFileSync(BASELINES_PATH, "utf-8");
  return JSON.parse(content);
}

function loadCurrentScores(filePath: string): Record<string, number | null> {
  const content = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(content);

  const scores: Record<string, number | null> = {};

  // Support { results: { key: { mean: number } } }
  if (data.results) {
    for (const [key, entry] of Object.entries(
      data.results as Record<string, { mean?: number; scores?: number[] }>,
    )) {
      if (entry.mean !== undefined) {
        scores[key] = entry.mean;
      } else if (Array.isArray(entry.scores) && entry.scores.length > 0) {
        scores[key] =
          entry.scores.reduce((a: number, b: number) => a + b, 0) /
          entry.scores.length;
      }
    }
  }

  return scores;
}

export function compareScores(
  baseline: Baseline,
  current: Record<string, number | null>,
): ComparisonResult {
  const regressions: Regression[] = [];
  const improvements: ComparisonResult["improvements"] = [];

  for (const [key, entry] of Object.entries(baseline.evaluators)) {
    if (entry.mean === null) continue;
    const currentScore = current[key];
    if (currentScore === null || currentScore === undefined) continue;

    const delta = currentScore - entry.mean;
    const pctChange = entry.mean !== 0 ? delta / entry.mean : 0;

    if (pctChange < -0.1) {
      regressions.push({
        key,
        baseline: entry.mean,
        current: currentScore,
        delta: Math.round(delta * 1000) / 1000,
        severity: "fail",
      });
    } else if (pctChange < -0.05) {
      regressions.push({
        key,
        baseline: entry.mean,
        current: currentScore,
        delta: Math.round(delta * 1000) / 1000,
        severity: "warning",
      });
    } else if (pctChange > 0.05) {
      improvements.push({
        key,
        baseline: entry.mean,
        current: currentScore,
        delta: Math.round(delta * 1000) / 1000,
      });
    }
  }

  return {
    baselineVersion: baseline.version,
    regressions,
    improvements,
    hasFailed: regressions.some((r) => r.severity === "fail"),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const inputFile = args.find(
    (a) => a.endsWith(".json") && !a.startsWith("--"),
  );
  if (!inputFile) {
    console.error(
      "Usage: compare-baseline.ts <current-scores.json> [--output regressions.json]",
    );
    process.exit(1);
  }

  const outputIdx = args.indexOf("--output");
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : undefined;

  const baseline = loadBaseline();
  const current = loadCurrentScores(inputFile);
  const result = compareScores(baseline, current);

  // Print summary
  console.log(`Comparing against baseline ${result.baselineVersion}\n`);

  if (result.regressions.length > 0) {
    console.log("Regressions:");
    for (const r of result.regressions) {
      const icon = r.severity === "fail" ? "FAIL" : "WARN";
      console.log(
        `  [${icon}] ${r.key}: ${r.baseline.toFixed(3)} → ${r.current.toFixed(3)} (${r.delta > 0 ? "+" : ""}${r.delta.toFixed(3)})`,
      );
    }
  }

  if (result.improvements.length > 0) {
    console.log("\nImprovements:");
    for (const i of result.improvements) {
      console.log(
        `  [UP]   ${i.key}: ${i.baseline.toFixed(3)} → ${i.current.toFixed(3)} (+${i.delta.toFixed(3)})`,
      );
    }
  }

  if (result.regressions.length === 0 && result.improvements.length === 0) {
    console.log("No significant changes from baseline.");
  }

  if (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n");
    console.log(`\nDetailed results written to: ${outputFile}`);
  }

  if (result.hasFailed) {
    console.error("\nRegression detected — failing.");
    process.exit(1);
  }
}

main();
