import type { EvaluationResult } from "langsmith/evaluation";
import { runEvalSuite } from "../helpers/evaluatorRunner.js";
import { runPipeline } from "../helpers/pipeline.js";
import { DATASET_NAMES } from "../config.js";

/**
 * Target function: runs the full pipeline and returns citations + answer.
 */
async function citationTarget(
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const message = String(inputs.message ?? "");
  const result = await runPipeline(message);
  return {
    answer: result.state.answer ?? "",
    citations: result.state.citations,
    hasRetrievedDocs: result.state.retrievedDocuments.length > 0,
    trajectory: result.trajectory,
  };
}

/**
 * Deterministic citation accuracy evaluator.
 *
 * Scores:
 * - citationsPresent: 1.0 if citations exist when retrieved docs exist
 * - citationsHaveUrls: fraction of citations with non-empty url
 * - citationsHaveSnippets: fraction of citations with non-empty snippet
 */
function citationEvaluator(args: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): EvaluationResult[] {
  const outputs = args.outputs;
  const citations = Array.isArray(outputs.citations)
    ? (outputs.citations as Array<{
        title?: string;
        url?: string;
        snippet?: string;
      }>)
    : [];
  const hasRetrievedDocs = Boolean(outputs.hasRetrievedDocs);
  const trajectory = Array.isArray(outputs.trajectory)
    ? (outputs.trajectory as string[])
    : [];

  const results: EvaluationResult[] = [];

  // Skip citation checks for clarify path (no retrieval happens)
  if (trajectory.includes("clarify")) {
    results.push({
      key: "citations_present",
      score: 1.0,
      comment: "Clarification path — citations not applicable",
    });
    return results;
  }

  // citationsPresent: citations should exist when docs were retrieved
  if (hasRetrievedDocs) {
    results.push({
      key: "citations_present",
      score: citations.length > 0 ? 1.0 : 0.0,
      comment:
        citations.length > 0
          ? `${citations.length} citations present`
          : "No citations despite having retrieved documents",
    });
  } else {
    results.push({
      key: "citations_present",
      score: 1.0,
      comment: "No retrieved documents — citations not expected",
    });
  }

  if (citations.length > 0) {
    // citationsHaveUrls: fraction with non-empty url
    const withUrl = citations.filter((c) => c.url && c.url.length > 0).length;
    results.push({
      key: "citations_have_urls",
      score: withUrl / citations.length,
      comment: `${withUrl}/${citations.length} citations have URLs`,
    });

    // citationsHaveSnippets: fraction with non-empty snippet
    const withSnippet = citations.filter(
      (c) => c.snippet && c.snippet.length > 0,
    ).length;
    results.push({
      key: "citations_have_snippets",
      score: withSnippet / citations.length,
      comment: `${withSnippet}/${citations.length} citations have snippets`,
    });
  }

  return results;
}

/**
 * Runs the citation evaluation suite.
 */
export async function run(): Promise<void> {
  await runEvalSuite({
    datasetName: DATASET_NAMES.answerQuality,
    experimentPrefix: "citation-accuracy",
    description:
      "Deterministic citation evaluation — presence, URLs, and snippets",
    target: citationTarget,
    evaluators: [citationEvaluator],
    maxConcurrency: 2,
  });
}
