import { HumanMessage } from "@langchain/core/messages";
import { classifierNode } from "@usopc/core";
import type { EvaluationResult } from "langsmith/evaluation";
import { makeTestState } from "../helpers/stateFactory.js";
import { runEvalSuite } from "../helpers/evaluatorRunner.js";
import { DATASET_NAMES } from "../config.js";
import { routeByDomain } from "@usopc/core";

/**
 * Computes Jaccard similarity between two string sets.
 * Returns 1.0 if both empty, 0.0 if disjoint.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1.0;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Target function: runs the classifier node on a user message
 * and returns the classification result.
 */
async function classifierTarget(
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const message = String(inputs.message ?? "");
  const state = makeTestState({
    messages: [new HumanMessage(message)],
  });

  const result = await classifierNode(state);

  // Determine shouldEscalate from the routing decision
  const postState = { ...state, ...result };
  const route = routeByDomain(postState);

  return {
    topicDomain: result.topicDomain ?? "team_selection",
    queryIntent: result.queryIntent ?? "general",
    detectedNgbIds: result.detectedNgbIds ?? [],
    shouldEscalate: route === "escalate",
    needsClarification: result.needsClarification ?? false,
  };
}

/**
 * Evaluator: scores classifier output field-by-field against expected values.
 */
function classifierAccuracyEvaluator(args: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): EvaluationResult[] {
  const outputs = args.outputs;
  const expected = args.referenceOutputs ?? {};

  const results: EvaluationResult[] = [];

  // topicDomain — exact match
  results.push({
    key: "topic_domain_accuracy",
    score: outputs.topicDomain === expected.topicDomain ? 1.0 : 0.0,
  });

  // queryIntent — exact match
  results.push({
    key: "query_intent_accuracy",
    score: outputs.queryIntent === expected.queryIntent ? 1.0 : 0.0,
  });

  // detectedNgbIds — Jaccard similarity
  const actualNgbs = Array.isArray(outputs.detectedNgbIds)
    ? (outputs.detectedNgbIds as string[])
    : [];
  const expectedNgbs = Array.isArray(expected.detectedNgbIds)
    ? (expected.detectedNgbIds as string[])
    : [];
  results.push({
    key: "ngb_detection_jaccard",
    score: jaccardSimilarity(actualNgbs, expectedNgbs),
  });

  // shouldEscalate — exact match
  results.push({
    key: "escalation_accuracy",
    score: outputs.shouldEscalate === expected.shouldEscalate ? 1.0 : 0.0,
  });

  // needsClarification — exact match
  results.push({
    key: "clarification_accuracy",
    score:
      outputs.needsClarification === expected.needsClarification ? 1.0 : 0.0,
  });

  return results;
}

/**
 * Runs the classifier accuracy evaluation suite.
 */
export async function run() {
  return await runEvalSuite({
    datasetName: DATASET_NAMES.classifier,
    experimentPrefix: "classifier-accuracy",
    description:
      "Deterministic classifier evaluation — field-by-field accuracy scoring",
    target: classifierTarget,
    evaluators: [classifierAccuracyEvaluator],
    maxConcurrency: 3,
  });
}
