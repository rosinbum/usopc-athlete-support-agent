import * as ls from "langsmith/vitest";
import { createLLMAsJudge, CORRECTNESS_PROMPT } from "openevals";
import { DATASET_NAMES } from "../config.js";
import { runPipelineForAnswerEval } from "../helpers/pipeline.js";
import { fetchExamples } from "../helpers/fetchExamples.js";

const correctnessJudge = createLLMAsJudge({
  prompt: CORRECTNESS_PROMPT,
  feedbackKey: "correctness",
  model: "openai:gpt-4o",
  continuous: true,
});

const examples = await fetchExamples(DATASET_NAMES.answerQuality);

ls.describe("usopc-correctness", () => {
  ls.test.each(examples)(
    "answer correctness",
    async ({ inputs, referenceOutputs }) => {
      const message = String(inputs.message ?? "");
      const result = await runPipelineForAnswerEval(message);

      const outputs = { answer: result.answer };
      ls.logOutputs(outputs);

      // LLM-as-judge correctness
      const wrappedJudge = ls.wrapEvaluator(correctnessJudge);
      await wrappedJudge({
        inputs,
        outputs,
        referenceOutputs,
      });

      // Deterministic conciseness
      const wordCount = result.answer.split(/\s+/).filter(Boolean).length;
      const maxWords = 150;
      const concisenessScore =
        wordCount <= maxWords
          ? 1.0
          : Math.max(0, 1.0 - (wordCount - maxWords) / 200);
      ls.logFeedback({ key: "conciseness", score: concisenessScore });
    },
  );
});
