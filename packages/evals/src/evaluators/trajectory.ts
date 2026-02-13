import type { EvaluationResult } from "langsmith/evaluation";
import { runEvalSuite } from "../helpers/evaluatorRunner.js";
import { runPipeline } from "../helpers/pipeline.js";
import { DATASET_NAMES } from "../config.js";

/**
 * Target function: runs the full pipeline and returns the trajectory.
 */
async function trajectoryTarget(
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const message = String(inputs.message ?? "");
  const result = await runPipeline(message);
  return {
    trajectory: result.trajectory,
    answer: result.state.answer ?? "",
  };
}

/**
 * Deterministic trajectory match evaluator.
 *
 * Compares the actual node traversal order against the expected trajectory.
 * Uses strict matching — exact sequence must match.
 */
function trajectoryMatchEvaluator(args: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): EvaluationResult[] {
  const actual = Array.isArray(args.outputs.trajectory)
    ? (args.outputs.trajectory as string[])
    : [];
  const expected = Array.isArray(args.referenceOutputs?.trajectory)
    ? (args.referenceOutputs!.trajectory as string[])
    : [];

  const results: EvaluationResult[] = [];

  // Strict sequence match
  const isExactMatch =
    actual.length === expected.length &&
    actual.every((node, i) => node === expected[i]);

  results.push({
    key: "trajectory_strict_match",
    score: isExactMatch ? 1.0 : 0.0,
    comment: isExactMatch
      ? "Exact trajectory match"
      : `Expected: [${expected.join(" → ")}], Got: [${actual.join(" → ")}]`,
  });

  // Subset match — did the actual trajectory contain all expected nodes (in order)?
  let subsetIdx = 0;
  for (const node of actual) {
    if (subsetIdx < expected.length && node === expected[subsetIdx]) {
      subsetIdx++;
    }
  }
  const subsetMatch = subsetIdx === expected.length;

  results.push({
    key: "trajectory_subset_match",
    score: subsetMatch ? 1.0 : 0.0,
    comment: subsetMatch
      ? "All expected nodes found in order"
      : `Missing nodes from expected trajectory`,
  });

  // Path type correctness — check if the right path was taken
  const pathType = args.referenceOutputs?.pathType;
  let pathCorrect = false;

  if (pathType === "happy" && actual.includes("synthesizer")) {
    pathCorrect = true;
  } else if (pathType === "clarify" && actual.includes("clarify")) {
    pathCorrect = true;
  } else if (pathType === "escalate" && actual.includes("escalate")) {
    pathCorrect = true;
  } else if (pathType === "low_confidence" && actual.includes("researcher")) {
    pathCorrect = true;
  }

  results.push({
    key: "path_type_correct",
    score: pathCorrect ? 1.0 : 0.0,
    comment: `Expected path type: ${pathType}, actual trajectory: [${actual.join(" → ")}]`,
  });

  return results;
}

/**
 * Runs the trajectory evaluation suite.
 */
export async function run(): Promise<void> {
  await runEvalSuite({
    datasetName: DATASET_NAMES.trajectory,
    experimentPrefix: "agent-trajectory",
    description:
      "Trajectory evaluation — verifies correct graph path traversal for different query types",
    target: trajectoryTarget,
    evaluators: [trajectoryMatchEvaluator],
    maxConcurrency: 2,
  });
}
