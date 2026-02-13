#!/usr/bin/env tsx

/**
 * Seeds the quality review scenario dataset to LangSmith.
 * Idempotent — skips the dataset if it already exists with the expected example count.
 *
 * Usage: pnpm --filter @usopc/evals quality:seed
 */

import { resolveEnv } from "../helpers/resolveEnv.js";

// Bridge SST Resource bindings → env vars before any SDK is loaded
resolveEnv();

import { getLangSmithClient, DATASET_NAMES } from "../config.js";
import { qualityReviewScenarios } from "../quality-review/scenarios.js";

async function main(): Promise<void> {
  const client = getLangSmithClient();
  const name = DATASET_NAMES.qualityReview;
  const examples = qualityReviewScenarios.map((s) => ({
    inputs: {
      messages: s.input.messages,
      userSport: s.input.userSport,
      scenarioId: s.id,
    },
    outputs: {
      metadata: s.metadata,
      ...(s.expectedOutput ?? {}),
    },
  }));

  // Check if dataset already exists
  let existingDataset;
  try {
    existingDataset = await client.readDataset({ datasetName: name });
  } catch {
    // Dataset doesn't exist yet
  }

  if (existingDataset) {
    const existing = [];
    for await (const ex of client.listExamples({
      datasetId: existingDataset.id,
    })) {
      existing.push(ex);
    }

    if (existing.length === examples.length) {
      console.log(
        `  ✓ "${name}" already exists with ${existing.length} examples — skipping`,
      );
      return;
    }

    console.log(
      `  ↻ "${name}" exists with ${existing.length} examples (expected ${examples.length}) — recreating`,
    );
    await client.deleteDataset({ datasetName: name });
  }

  const dataset = await client.createDataset(name, {
    description:
      "Quality review scenarios — realistic athlete questions across 10 categories for human-in-the-loop diagnosis.",
    dataType: "kv",
  });

  await client.createExamples({
    inputs: examples.map((ex) => ex.inputs),
    outputs: examples.map((ex) => ex.outputs),
    datasetId: dataset.id,
  });

  console.log(`  ✓ Created "${name}" with ${examples.length} examples`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
