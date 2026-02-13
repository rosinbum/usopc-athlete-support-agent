import { evaluate } from "langsmith/evaluation";
import type { EvaluatorT } from "langsmith/evaluation";
import type { KVMap } from "langsmith/schemas";
import { getLangSmithClient, LANGSMITH_PROJECT } from "../config.js";

/** A target function that processes a single dataset example. */
type TargetFn = (
  inputs: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export interface EvalSuiteConfig {
  /** LangSmith dataset name to evaluate against. */
  datasetName: string;
  /** Human-readable experiment prefix (e.g., "classifier-accuracy"). */
  experimentPrefix: string;
  /** The target function that processes each dataset example. */
  target: TargetFn;
  /** One or more evaluator functions. */
  evaluators: EvaluatorT[];
  /** Optional description for the experiment. */
  description?: string;
  /** Max concurrency for running examples (default: 5). */
  maxConcurrency?: number;
}

export interface SuiteResult {
  /** Aggregate mean score per metric key. */
  metrics: Record<string, number>;
  /** Total examples evaluated. */
  totalExamples: number;
  /** Number of examples where all metrics scored 1.0. */
  perfectExamples: number;
}

/**
 * Runs a suite of evaluators against a LangSmith dataset, logs the results
 * as a LangSmith experiment, and prints a summary table to stdout.
 */
export async function runEvalSuite(
  config: EvalSuiteConfig,
): Promise<SuiteResult> {
  const client = getLangSmithClient();

  const experimentResults = await evaluate(
    config.target as (inputs: KVMap) => Promise<KVMap>,
    {
      data: config.datasetName,
      evaluators: config.evaluators,
      experimentPrefix: config.experimentPrefix,
      description: config.description,
      maxConcurrency: config.maxConcurrency ?? 5,
      client,
      metadata: {
        project: LANGSMITH_PROJECT,
      },
    },
  );

  // Collect scores per metric across all examples
  const scoresByKey: Record<string, number[]> = {};
  let totalExamples = 0;
  let perfectExamples = 0;

  for (const row of experimentResults.results) {
    totalExamples++;
    let allPerfect = true;

    for (const evalResult of row.evaluationResults.results) {
      const key = evalResult.key;
      const score = typeof evalResult.score === "number" ? evalResult.score : 0;
      if (!scoresByKey[key]) scoresByKey[key] = [];
      scoresByKey[key].push(score);
      if (score < 1.0) allPerfect = false;
    }

    if (allPerfect) perfectExamples++;
  }

  // Compute aggregate means
  const metrics: Record<string, number> = {};
  for (const [key, scores] of Object.entries(scoresByKey)) {
    metrics[key] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log(`  RESULTS: ${config.experimentPrefix}`);
  console.log("=".repeat(60));
  console.log(
    `  Examples: ${totalExamples}  |  Perfect: ${perfectExamples}/${totalExamples}`,
  );
  console.log("-".repeat(60));
  console.log(`  ${"Metric".padEnd(35)} ${"Mean".padEnd(10)} Status`);
  console.log("-".repeat(60));

  let allPass = true;
  for (const [key, mean] of Object.entries(metrics)) {
    const status = mean >= 0.8 ? "PASS" : "FAIL";
    if (mean < 0.8) allPass = false;
    console.log(`  ${key.padEnd(35)} ${mean.toFixed(3).padEnd(10)} ${status}`);
  }

  console.log("-".repeat(60));
  console.log(`  Overall: ${allPass ? "PASS" : "FAIL"}`);
  console.log("=".repeat(60) + "\n");

  return { metrics, totalExamples, perfectExamples };
}
