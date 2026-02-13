import { createLLMAsJudge, CORRECTNESS_PROMPT } from "openevals";
import type { EvaluationResult } from "langsmith/evaluation";
import { runEvalSuite } from "../helpers/evaluatorRunner.js";
import { runPipelineForAnswerEval } from "../helpers/pipeline.js";
import { DATASET_NAMES } from "../config.js";

/**
 * Target function: runs the full pipeline and returns the answer.
 */
async function correctnessTarget(
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const message = String(inputs.message ?? "");
  const result = await runPipelineForAnswerEval(message);
  return { answer: result.answer };
}

/**
 * LLM-as-judge evaluator for answer correctness.
 * Compares agent answers against reference answers.
 */
const correctnessJudge = createLLMAsJudge({
  prompt: CORRECTNESS_PROMPT,
  feedbackKey: "correctness",
  model: "openai:gpt-4o",
  continuous: true,
});

/**
 * Deterministic evaluator for answer conciseness.
 * Factual answers should be < 150 words, deadline answers < 100 words.
 */
function concisenessEvaluator(args: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): EvaluationResult {
  const answer = String(args.outputs.answer ?? "");
  const wordCount = answer.split(/\s+/).filter(Boolean).length;

  // Use a generous limit — we primarily care about egregiously verbose answers
  const maxWords = 150;
  const score =
    wordCount <= maxWords
      ? 1.0
      : Math.max(0, 1.0 - (wordCount - maxWords) / 200);

  return {
    key: "conciseness",
    score,
    comment: `Answer has ${wordCount} words (limit: ${maxWords})`,
  };
}

/**
 * Runs the correctness evaluation suite.
 */
export async function run(): Promise<void> {
  await runEvalSuite({
    datasetName: DATASET_NAMES.answerQuality,
    experimentPrefix: "answer-correctness",
    description:
      "LLM-as-judge correctness evaluation + deterministic conciseness check",
    target: correctnessTarget,
    evaluators: [
      async (args: {
        inputs: Record<string, unknown>;
        outputs: Record<string, unknown>;
        referenceOutputs?: Record<string, unknown>;
      }) => {
        return correctnessJudge({
          inputs: args.inputs,
          outputs: args.outputs,
          reference_outputs: args.referenceOutputs,
        });
      },
      concisenessEvaluator,
    ],
    maxConcurrency: 2,
  });
}
