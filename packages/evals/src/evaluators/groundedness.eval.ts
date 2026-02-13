import * as ls from "langsmith/vitest";
import { createLLMAsJudge, RAG_GROUNDEDNESS_PROMPT } from "openevals";
import { DATASET_NAMES } from "../config.js";
import { runPipelineForAnswerEval } from "../helpers/pipeline.js";
import { fetchExamples } from "../helpers/fetchExamples.js";

const groundednessJudge = createLLMAsJudge({
  prompt: RAG_GROUNDEDNESS_PROMPT,
  feedbackKey: "groundedness",
  model: "openai:gpt-4o",
  continuous: true,
});

const examples = await fetchExamples(DATASET_NAMES.answerQuality);

ls.describe("usopc-groundedness", () => {
  ls.test.each(examples)(
    "answer groundedness",
    async ({ inputs, referenceOutputs }) => {
      const message = String(inputs.message ?? "");
      const result = await runPipelineForAnswerEval(message);

      const outputs = { answer: result.answer };
      ls.logOutputs(outputs);

      const wrappedJudge = ls.wrapEvaluator(groundednessJudge);
      await wrappedJudge({
        inputs,
        outputs,
        referenceOutputs,
      });
    },
  );
});
