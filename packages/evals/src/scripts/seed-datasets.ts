#!/usr/bin/env tsx

/**
 * Seeds evaluation datasets to LangSmith.
 * Idempotent — skips datasets that already exist with the expected example count.
 *
 * Usage: pnpm --filter @usopc/evals seed-langsmith
 */

import { resolveEnv } from "../helpers/resolveEnv.js";

// Bridge SST Resource bindings → env vars before any SDK is loaded
resolveEnv();

import { getLangSmithClient, DATASET_NAMES } from "../config.js";
import { classifierExamples } from "../datasets/classifier.js";
import { retrievalExamples } from "../datasets/retrieval.js";
import { answerQualityExamples } from "../datasets/answerQuality.js";
import { escalationExamples } from "../datasets/escalation.js";
import { trajectoryExamples } from "../datasets/trajectory.js";

interface DatasetSpec {
  name: string;
  description: string;
  examples: Array<{
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
  }>;
}

function buildDatasetSpecs(): DatasetSpec[] {
  return [
    {
      name: DATASET_NAMES.classifier,
      description:
        "Classifier accuracy evaluation — user messages with expected topicDomain, queryIntent, NGB IDs, escalation, and clarification flags.",
      examples: classifierExamples.map((ex) => ({
        inputs: ex.input,
        outputs: ex.expectedOutput,
      })),
    },
    {
      name: DATASET_NAMES.retrieval,
      description:
        "Retrieval evaluation — queries with domain/NGB context and expected keywords in retrieved documents.",
      examples: retrievalExamples.map((ex) => ({
        inputs: ex.input,
        outputs: ex.expectedOutput,
      })),
    },
    {
      name: DATASET_NAMES.answerQuality,
      description:
        "Answer quality evaluation — user messages with reference answers and required key facts.",
      examples: answerQualityExamples.map((ex) => ({
        inputs: ex.input,
        outputs: ex.expectedOutput,
      })),
    },
    {
      name: DATASET_NAMES.escalation,
      description:
        "Escalation routing evaluation — safety-critical queries with expected escalation targets, urgency, and required contact info.",
      examples: escalationExamples.map((ex) => ({
        inputs: ex.input,
        outputs: ex.expectedOutput,
      })),
    },
    {
      name: DATASET_NAMES.trajectory,
      description:
        "Agent trajectory evaluation — user messages with expected graph node traversal sequences.",
      examples: trajectoryExamples.map((ex) => ({
        inputs: ex.input,
        outputs: ex.expectedOutput,
      })),
    },
  ];
}

async function seedDataset(spec: DatasetSpec): Promise<void> {
  const client = getLangSmithClient();

  // Check if dataset already exists
  let existingDataset;
  try {
    existingDataset = await client.readDataset({ datasetName: spec.name });
  } catch {
    // Dataset doesn't exist yet
  }

  if (existingDataset) {
    // Check example count
    const examples = [];
    for await (const ex of client.listExamples({
      datasetId: existingDataset.id,
    })) {
      examples.push(ex);
    }

    if (examples.length === spec.examples.length) {
      console.log(
        `  ✓ "${spec.name}" already exists with ${examples.length} examples — skipping`,
      );
      return;
    }

    // Delete and recreate if count doesn't match
    console.log(
      `  ↻ "${spec.name}" exists with ${examples.length} examples (expected ${spec.examples.length}) — recreating`,
    );
    await client.deleteDataset({ datasetName: spec.name });
  }

  // Create dataset
  const dataset = await client.createDataset(spec.name, {
    description: spec.description,
    dataType: "kv",
  });

  // Create examples
  await client.createExamples({
    inputs: spec.examples.map((ex) => ex.inputs),
    outputs: spec.examples.map((ex) => ex.outputs),
    datasetId: dataset.id,
  });

  console.log(
    `  ✓ Created "${spec.name}" with ${spec.examples.length} examples`,
  );
}

async function main(): Promise<void> {
  console.log("Seeding evaluation datasets to LangSmith...\n");

  const specs = buildDatasetSpecs();

  for (const spec of specs) {
    await seedDataset(spec);
  }

  console.log("\nDone. All datasets seeded.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
