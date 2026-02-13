import { createLLMAsJudge, RAG_GROUNDEDNESS_PROMPT } from "openevals";
import { runEvalSuite } from "../helpers/evaluatorRunner.js";
import { runPipelineForAnswerEval } from "../helpers/pipeline.js";
import { DATASET_NAMES } from "../config.js";

/**
 * Target function: runs the full pipeline and returns the answer for
 * groundedness evaluation by the LLM judge.
 */
async function groundednessTarget(
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const message = String(inputs.message ?? "");
  const result = await runPipelineForAnswerEval(message);
  return { answer: result.answer };
}

/**
 * LLM-as-judge evaluator for answer groundedness.
 *
 * Uses openevals RAG_GROUNDEDNESS_PROMPT to check that every claim in the
 * agent's answer is supported by the retrieved context. This is the
 * highest-priority eval — fabricated compliance guidance could harm athletes.
 */
const groundednessJudge = createLLMAsJudge({
  prompt: RAG_GROUNDEDNESS_PROMPT,
  feedbackKey: "groundedness",
  model: "openai:gpt-4o",
  continuous: true,
});

/**
 * Runs the groundedness evaluation suite.
 */
export async function run() {
  return await runEvalSuite({
    datasetName: DATASET_NAMES.answerQuality,
    experimentPrefix: "answer-groundedness",
    description:
      "LLM-as-judge groundedness evaluation — checks that answers are supported by retrieved context",
    target: groundednessTarget,
    evaluators: [
      async (args: {
        inputs: Record<string, unknown>;
        outputs: Record<string, unknown>;
        referenceOutputs?: Record<string, unknown>;
      }) => {
        return groundednessJudge({
          inputs: args.inputs,
          outputs: args.outputs,
          reference_outputs: args.referenceOutputs,
        });
      },
    ],
    maxConcurrency: 2,
  });
}
