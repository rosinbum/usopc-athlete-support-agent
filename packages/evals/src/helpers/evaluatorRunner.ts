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

/**
 * Runs a suite of evaluators against a LangSmith dataset and logs the
 * results as a LangSmith experiment.
 *
 * Returns the experiment results for downstream assertions or reporting.
 */
export async function runEvalSuite(config: EvalSuiteConfig): Promise<void> {
  const client = getLangSmithClient();

  await evaluate(config.target as (inputs: KVMap) => Promise<KVMap>, {
    data: config.datasetName,
    evaluators: config.evaluators,
    experimentPrefix: config.experimentPrefix,
    description: config.description,
    maxConcurrency: config.maxConcurrency ?? 5,
    client,
    metadata: {
      project: LANGSMITH_PROJECT,
    },
  });
}
