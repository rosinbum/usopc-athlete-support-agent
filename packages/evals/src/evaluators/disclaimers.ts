import type { EvaluationResult } from "langsmith/evaluation";
import { getDisclaimer } from "@usopc/core";
import type { TopicDomain } from "@usopc/core";
import { runEvalSuite } from "../helpers/evaluatorRunner.js";
import { runPipeline } from "../helpers/pipeline.js";
import { DATASET_NAMES } from "../config.js";

/** Separator used by the disclaimerGuard node. */
const DISCLAIMER_SEPARATOR = "\n\n---\n\n";

/** Safety-critical strings that must appear in domain-specific disclaimers. */
const DOMAIN_REQUIRED_STRINGS: Partial<Record<TopicDomain, string[]>> = {
  safesport: ["911", "uscenterforsafesport.org", "833-587-7233"],
  anti_doping: ["usada.org", "1-866-601-2632"],
};

/**
 * Target function: runs the full pipeline and returns the answer + domain.
 */
async function disclaimerTarget(
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const message = String(inputs.message ?? "");
  const result = await runPipeline(message);

  // Infer the topic domain from the trajectory and answer
  const trajectory = result.trajectory;
  const isClarify = trajectory.includes("clarify");

  return {
    answer: result.state.answer ?? "",
    topicDomain: result.state.topicDomain,
    trajectory,
    isClarify,
  };
}

/**
 * Deterministic disclaimer compliance evaluator.
 *
 * Scores:
 * - disclaimerPresent: 1.0 if answer contains disclaimer separator
 * - disclaimerCorrectDomain: disclaimer text matches expected for the domain
 * - Safety-critical: SafeSport answers include reporting URL; anti-doping includes USADA
 */
function disclaimerEvaluator(args: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): EvaluationResult[] {
  const outputs = args.outputs;
  const answer = String(outputs.answer ?? "");
  const domain = outputs.topicDomain as TopicDomain | undefined;
  const isClarify = Boolean(outputs.isClarify);

  const results: EvaluationResult[] = [];

  // Clarification responses may not have disclaimers — that's OK
  if (isClarify) {
    results.push({
      key: "disclaimer_present",
      score: 1.0,
      comment: "Clarification path — disclaimer not required",
    });
    return results;
  }

  // disclaimerPresent: non-clarification answers must have a disclaimer
  const hasDisclaimer = answer.includes(DISCLAIMER_SEPARATOR);
  results.push({
    key: "disclaimer_present",
    score: hasDisclaimer ? 1.0 : 0.0,
    comment: hasDisclaimer
      ? "Disclaimer separator found"
      : "Missing disclaimer separator in answer",
  });

  if (hasDisclaimer && domain) {
    // disclaimerCorrectDomain: the disclaimer text should match the domain
    const expectedDisclaimer = getDisclaimer(domain);
    const disclaimerPart = answer.split(DISCLAIMER_SEPARATOR).pop() ?? "";
    const containsExpected = disclaimerPart.includes(
      expectedDisclaimer.substring(0, 50),
    );

    results.push({
      key: "disclaimer_correct_domain",
      score: containsExpected ? 1.0 : 0.0,
      comment: containsExpected
        ? `Disclaimer matches "${domain}" domain`
        : `Disclaimer does not match expected "${domain}" domain text`,
    });

    // Safety-critical checks
    const requiredStrings = DOMAIN_REQUIRED_STRINGS[domain];
    if (requiredStrings) {
      const found = requiredStrings.filter((s) =>
        answer.toLowerCase().includes(s.toLowerCase()),
      );
      const missing = requiredStrings.filter(
        (s) => !answer.toLowerCase().includes(s.toLowerCase()),
      );

      results.push({
        key: "disclaimer_safety_info",
        score: found.length / requiredStrings.length,
        comment:
          missing.length > 0
            ? `Missing safety-critical info: ${missing.join(", ")}`
            : "All safety-critical info present in disclaimer",
      });
    }
  }

  return results;
}

/**
 * Runs the disclaimer evaluation suite.
 */
export async function run() {
  return await runEvalSuite({
    datasetName: DATASET_NAMES.answerQuality,
    experimentPrefix: "disclaimer-compliance",
    description:
      "Deterministic disclaimer evaluation — presence, domain correctness, and safety-critical info",
    target: disclaimerTarget,
    evaluators: [disclaimerEvaluator],
    maxConcurrency: 2,
  });
}
