import * as ls from "langsmith/vitest";
import { OpenAIEmbeddings } from "@langchain/openai";
import { DATASET_NAMES } from "../config.js";
import { runPipelineForAnswerEval } from "../helpers/pipeline.js";
import { fetchExamples } from "../helpers/fetchExamples.js";

const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-3-small",
});

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const examples = await fetchExamples(DATASET_NAMES.answerQuality);

ls.describe("usopc-semantic-similarity", () => {
  ls.test.each(examples)(
    "answer semantic similarity",
    async ({ inputs, referenceOutputs }) => {
      const message = String(inputs.message ?? "");
      const result = await runPipelineForAnswerEval(message);

      const outputs = { answer: result.answer };
      ls.logOutputs(outputs);

      const referenceAnswer = String(referenceOutputs?.referenceAnswer ?? "");
      if (!referenceAnswer || !result.answer) {
        ls.logFeedback({ key: "semantic_similarity", score: 0 });
        return;
      }

      const [answerEmbed, refEmbed] = await Promise.all([
        embeddings.embedQuery(result.answer),
        embeddings.embedQuery(referenceAnswer),
      ]);

      const similarity = cosineSimilarity(answerEmbed, refEmbed);
      ls.logFeedback({ key: "semantic_similarity", score: similarity });
    },
  );
});
