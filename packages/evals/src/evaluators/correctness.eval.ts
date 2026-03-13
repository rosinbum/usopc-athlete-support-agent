import * as ls from "langsmith/vitest";
import { expect } from "vitest";
import { createLLMAsJudge, CORRECTNESS_PROMPT } from "openevals";
import { DATASET_NAMES } from "../config.js";
import { runPipelineForAnswerEval } from "../helpers/pipeline.js";
import { fetchExamples } from "../helpers/fetchExamples.js";

const correctnessJudge = createLLMAsJudge({
  prompt: CORRECTNESS_PROMPT,
  feedbackKey: "correctness",
  model: "openai:gpt-4o-mini",
  continuous: true,
});

const examples = await fetchExamples(DATASET_NAMES.answerQuality);

ls.describe(DATASET_NAMES.answerQuality, () => {
  ls.test.each(examples)(
    "answer correctness",
    async ({ inputs, referenceOutputs }) => {
      const message = String(inputs.message ?? "");
      const result = await runPipelineForAnswerEval(message);

      const outputs = { answer: result.answer };
      ls.logOutputs(outputs);

      // openevals auto-wraps in langsmith/vitest test context — do not
      // double-wrap with ls.wrapEvaluator.  CORRECTNESS_PROMPT uses
      // {inputs}, {outputs}, and {reference_outputs} template variables.
      const judgeResult = await correctnessJudge({
        inputs,
        outputs,
        referenceOutputs,
      });
      expect(
        judgeResult.score,
        "correctness score must be >= 0.4",
      ).toBeGreaterThanOrEqual(0.4);

      // Deterministic conciseness
      const wordCount = result.answer.split(/\s+/).filter(Boolean).length;
      const maxWords = 150;
      const concisenessScore =
        wordCount <= maxWords
          ? 1.0
          : Math.max(0, 1.0 - (wordCount - maxWords) / 200);
      ls.logFeedback({ key: "conciseness", score: concisenessScore });
      expect(
        concisenessScore,
        "conciseness score must be >= 0.5",
      ).toBeGreaterThanOrEqual(0.5);
    },
  );
});
