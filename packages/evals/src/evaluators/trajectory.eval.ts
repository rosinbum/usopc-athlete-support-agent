import * as ls from "langsmith/vitest";
import { DATASET_NAMES } from "../config.js";
import { runPipeline } from "../helpers/pipeline.js";
import { fetchExamples } from "../helpers/fetchExamples.js";

const examples = await fetchExamples(DATASET_NAMES.trajectory);

ls.describe("usopc-trajectory", () => {
  ls.test.each(examples)(
    "trajectory match",
    async ({ inputs, referenceOutputs }) => {
      const message = String(inputs.message ?? "");
      const result = await runPipeline(message);

      const actual = result.trajectory;
      const outputs = {
        trajectory: actual,
        answer: result.state.answer ?? "",
      };
      ls.logOutputs(outputs);

      const expected = Array.isArray(referenceOutputs?.trajectory)
        ? (referenceOutputs!.trajectory as string[])
        : [];

      // Strict sequence match
      const isExactMatch =
        actual.length === expected.length &&
        actual.every((node, i) => node === expected[i]);
      ls.logFeedback({
        key: "trajectory_strict_match",
        score: isExactMatch ? 1.0 : 0.0,
      });

      // Subset match — did the actual trajectory contain all expected nodes (in order)?
      let subsetIdx = 0;
      for (const node of actual) {
        if (subsetIdx < expected.length && node === expected[subsetIdx]) {
          subsetIdx++;
        }
      }
      const subsetMatch = subsetIdx === expected.length;
      ls.logFeedback({
        key: "trajectory_subset_match",
        score: subsetMatch ? 1.0 : 0.0,
      });

      // Path type correctness
      const pathType = referenceOutputs?.pathType;
      let pathCorrect = false;
      if (pathType === "happy" && actual.includes("synthesizer")) {
        pathCorrect = true;
      } else if (pathType === "clarify" && actual.includes("clarify")) {
        pathCorrect = true;
      } else if (pathType === "escalate" && actual.includes("escalate")) {
        pathCorrect = true;
      } else if (
        pathType === "low_confidence" &&
        actual.includes("researcher")
      ) {
        pathCorrect = true;
      }
      ls.logFeedback({
        key: "path_type_correct",
        score: pathCorrect ? 1.0 : 0.0,
      });
    },
  );
});
