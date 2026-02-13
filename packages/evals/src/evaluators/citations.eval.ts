import * as ls from "langsmith/vitest";
import { DATASET_NAMES } from "../config.js";
import { runPipeline } from "../helpers/pipeline.js";
import { fetchExamples } from "../helpers/fetchExamples.js";

const examples = await fetchExamples(DATASET_NAMES.answerQuality);

ls.describe("usopc-citations", () => {
  ls.test.each(examples)("citation accuracy", async ({ inputs }) => {
    const message = String(inputs.message ?? "");
    const result = await runPipeline(message);

    const citations = result.state.citations ?? [];
    const hasRetrievedDocs = result.state.retrievedDocuments.length > 0;
    const trajectory = result.trajectory;

    const outputs = {
      answer: result.state.answer ?? "",
      citations,
      hasRetrievedDocs,
      trajectory,
    };
    ls.logOutputs(outputs);

    // Skip citation checks for clarify path (no retrieval happens)
    if (trajectory.includes("clarify")) {
      ls.logFeedback({
        key: "citations_present",
        score: 1.0,
      });
      return;
    }

    // citationsPresent: citations should exist when docs were retrieved
    if (hasRetrievedDocs) {
      ls.logFeedback({
        key: "citations_present",
        score: citations.length > 0 ? 1.0 : 0.0,
      });
    } else {
      ls.logFeedback({
        key: "citations_present",
        score: 1.0,
      });
    }

    if (citations.length > 0) {
      // citationsHaveUrls: fraction with non-empty url
      const withUrl = citations.filter((c) => c.url && c.url.length > 0).length;
      ls.logFeedback({
        key: "citations_have_urls",
        score: withUrl / citations.length,
      });

      // citationsHaveSnippets: fraction with non-empty snippet
      const withSnippet = citations.filter(
        (c) => c.snippet && c.snippet.length > 0,
      ).length;
      ls.logFeedback({
        key: "citations_have_snippets",
        score: withSnippet / citations.length,
      });
    }
  });
});
