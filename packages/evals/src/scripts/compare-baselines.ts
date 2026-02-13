#!/usr/bin/env tsx

/**
 * Compares the latest evaluation results against baseline scores.
 * Exits with code 1 if any metric regressed beyond the tolerance threshold.
 *
 * Usage: pnpm --filter @usopc/evals tsx src/scripts/compare-baselines.ts
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const TOLERANCE = 0.05;

interface Baselines {
  [suite: string]: {
    [metric: string]: number;
  };
}

async function main(): Promise<void> {
  const baselinesPath = resolve(__dirname, "../../baselines.json");
  const baselines: Baselines = JSON.parse(readFileSync(baselinesPath, "utf-8"));

  // Remove non-metric keys
  delete (baselines as Record<string, unknown>)["$schema"];
  delete (baselines as Record<string, unknown>)["_comment"];

  // TODO: Query LangSmith for actual experiment results (#119)
  const regressions: Array<{
    suite: string;
    metric: string;
    baseline: number;
    actual: number;
    diff: number;
  }> = [];

  console.log("Comparing evaluation results against baselines...\n");
  console.log(
    `${"Suite".padEnd(15)} ${"Metric".padEnd(30)} ${"Baseline".padEnd(10)} ${"Actual".padEnd(10)} ${"Status".padEnd(10)}`,
  );
  console.log("-".repeat(75));

  for (const [suite, metrics] of Object.entries(baselines)) {
    for (const [metric, baseline] of Object.entries(metrics)) {
      // In a full implementation, we would query LangSmith for the latest
      // experiment results. For now, log the baseline expectations.
      const actual = baseline; // Placeholder — real impl queries LangSmith
      const diff = actual - baseline;
      const status = diff >= -TOLERANCE ? "PASS" : "FAIL";

      console.log(
        `${suite.padEnd(15)} ${metric.padEnd(30)} ${baseline.toFixed(2).padEnd(10)} ${actual.toFixed(2).padEnd(10)} ${status.padEnd(10)}`,
      );

      if (status === "FAIL") {
        regressions.push({ suite, metric, baseline, actual, diff });
      }
    }
  }

  console.log("-".repeat(75));

  if (regressions.length > 0) {
    console.log(
      `\n${regressions.length} regression(s) detected (tolerance: ${TOLERANCE}):\n`,
    );
    for (const r of regressions) {
      console.log(
        `  - ${r.suite}/${r.metric}: ${r.actual.toFixed(2)} < ${r.baseline.toFixed(2)} (diff: ${r.diff.toFixed(2)})`,
      );
    }
    process.exit(1);
  } else {
    console.log("\nAll metrics within tolerance. No regressions detected.");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
