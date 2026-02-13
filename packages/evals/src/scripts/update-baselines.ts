#!/usr/bin/env tsx

/**
 * Updates the baselines.json file with the latest evaluation results.
 * Run this after intentional prompt or logic changes.
 *
 * Usage: pnpm --filter @usopc/evals tsx src/scripts/update-baselines.ts
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const baselinesPath = resolve(__dirname, "../../baselines.json");
  const baselines = JSON.parse(readFileSync(baselinesPath, "utf-8"));

  console.log("Updating baselines from latest LangSmith experiment results...");
  console.log(
    "\nNote: This script is a placeholder. In a full implementation, it would:",
  );
  console.log("  1. Query LangSmith for the latest experiment results");
  console.log("  2. Compute aggregate scores per metric");
  console.log("  3. Update baselines.json with the new values");
  console.log(
    "\nCurrent baselines remain unchanged. Manually update baselines.json if needed.\n",
  );

  // Pretty-print current baselines
  console.log("Current baselines:");
  const { $schema, _comment, ...suites } = baselines;
  for (const [suite, metrics] of Object.entries(suites)) {
    console.log(`\n  ${suite}:`);
    for (const [metric, score] of Object.entries(
      metrics as Record<string, number>,
    )) {
      console.log(`    ${metric}: ${score}`);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
