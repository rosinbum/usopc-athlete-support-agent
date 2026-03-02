#!/usr/bin/env tsx

/**
 * Formats eval results as a Markdown PR comment.
 *
 * Reads vitest JSON output + optional baseline comparison and outputs
 * a Markdown string to stdout (intended for use with github-script).
 *
 * Usage:
 *   tsx report-pr.ts <eval-results.json> [regression-results.json]
 */

import fs from "node:fs";
import type { ComparisonResult } from "./compare-baseline.js";
import { EVALUATOR_GROUPS } from "./evaluatorKeys.js";

interface EvalResults {
  results?: Record<
    string,
    { mean?: number; scores?: number[]; total?: number; passed?: number }
  >;
}

type RegressionResults = Partial<ComparisonResult>;

function loadJSON<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function getMean(
  entry: { mean?: number; scores?: number[] } | undefined,
): number | null {
  if (!entry) return null;
  if (entry.mean !== undefined) return entry.mean;
  if (Array.isArray(entry.scores) && entry.scores.length > 0) {
    return entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length;
  }
  return null;
}

function formatScore(score: number | null): string {
  if (score === null) return "—";
  return score.toFixed(2);
}

function formatDelta(key: string, regressions?: RegressionResults): string {
  if (!regressions) return "—";

  const reg = regressions.regressions?.find((r) => r.key === key);
  if (reg) {
    const icon = reg.severity === "fail" ? "🔴" : "⚠️";
    return `${reg.delta > 0 ? "+" : ""}${reg.delta.toFixed(3)} ${icon}`;
  }

  const imp = regressions.improvements?.find((i) => i.key === key);
  if (imp) {
    return `+${imp.delta.toFixed(3)} ✅`;
  }

  return "—";
}

export function generateReport(
  evalResults: EvalResults,
  regressionResults?: RegressionResults,
): string {
  const results = evalResults.results ?? {};
  const lines: string[] = [];

  lines.push("## Eval Results\n");

  if (regressionResults?.baselineVersion) {
    lines.push(
      `Compared against baseline **${regressionResults.baselineVersion}**\n`,
    );
  }

  lines.push("| Evaluator | Score | vs Baseline |");
  lines.push("|-----------|-------|-------------|");

  for (const group of EVALUATOR_GROUPS) {
    // Group header
    lines.push(`| **${group.label}** | | |`);
    for (const key of group.keys) {
      const entry = results[key];
      const mean = getMean(entry);
      const delta = formatDelta(key, regressionResults);
      const displayKey = key.replace(/_/g, " ");
      lines.push(`| ${displayKey} | ${formatScore(mean)} | ${delta} |`);
    }
  }

  // Summary
  const regressionCount = regressionResults?.regressions?.length ?? 0;
  const failCount =
    regressionResults?.regressions?.filter((r) => r.severity === "fail")
      .length ?? 0;

  lines.push("");

  if (failCount > 0) {
    lines.push(
      `> 🔴 **${failCount} regression(s)** detected (>10% drop from baseline)`,
    );
  } else if (regressionCount > 0) {
    lines.push(
      `> ⚠️ **${regressionCount} warning(s)** — scores dipped 5-10% from baseline`,
    );
  } else {
    lines.push("> ✅ No regressions detected");
  }

  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const jsonFiles = args.filter(
    (a) => a.endsWith(".json") && !a.startsWith("--"),
  );

  if (jsonFiles.length === 0) {
    console.error(
      "Usage: report-pr.ts <eval-results.json> [regression-results.json]",
    );
    process.exit(1);
  }

  const evalResults = loadJSON<EvalResults>(jsonFiles[0]!);
  const regressionResults =
    jsonFiles.length > 1
      ? loadJSON<RegressionResults>(jsonFiles[1]!)
      : undefined;

  const markdown = generateReport(evalResults, regressionResults);
  process.stdout.write(markdown + "\n");
}

main();
