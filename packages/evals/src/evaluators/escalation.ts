import { HumanMessage } from "@langchain/core/messages";
import { classifierNode, escalateNode, routeByDomain } from "@usopc/core";
import type { EvaluationResult } from "langsmith/evaluation";
import { makeTestState } from "../helpers/stateFactory.js";
import { runEvalSuite } from "../helpers/evaluatorRunner.js";
import { DATASET_NAMES } from "../config.js";

/**
 * Target function: runs classifier → routing check → escalate node
 * and returns the escalation state.
 */
async function escalationTarget(
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const message = String(inputs.message ?? "");
  const state = makeTestState({
    messages: [new HumanMessage(message)],
  });

  // Run classifier
  const classResult = await classifierNode(state);
  const postClassState = { ...state, ...classResult };

  // Check routing
  const route = routeByDomain(postClassState);

  if (route !== "escalate") {
    return {
      routed: route,
      escalationTarget: null,
      urgency: null,
      answer: null,
    };
  }

  // Run escalation node
  const escResult = await escalateNode(postClassState);

  return {
    routed: route,
    escalationTarget: escResult.escalation?.target ?? null,
    urgency: escResult.escalation?.urgency ?? null,
    answer: escResult.answer ?? "",
    contactEmail: escResult.escalation?.contactEmail ?? null,
    contactPhone: escResult.escalation?.contactPhone ?? null,
    contactUrl: escResult.escalation?.contactUrl ?? null,
  };
}

/**
 * Deterministic evaluator for escalation routing correctness.
 */
function escalationEvaluator(args: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): EvaluationResult[] {
  const outputs = args.outputs;
  const expected = args.referenceOutputs ?? {};
  const results: EvaluationResult[] = [];

  // routeCorrect: did the agent route to "escalate"?
  results.push({
    key: "route_correct",
    score: outputs.routed === "escalate" ? 1.0 : 0.0,
    comment:
      outputs.routed === "escalate"
        ? "Correctly routed to escalate"
        : `Routed to "${outputs.routed}" instead of "escalate"`,
  });

  // targetCorrect: does the escalation target match?
  results.push({
    key: "target_correct",
    score: outputs.escalationTarget === expected.escalationTarget ? 1.0 : 0.0,
    comment: `Expected target: ${expected.escalationTarget}, got: ${outputs.escalationTarget}`,
  });

  // urgencyCorrect: does the urgency match?
  results.push({
    key: "urgency_correct",
    score: outputs.urgency === expected.urgency ? 1.0 : 0.0,
    comment: `Expected urgency: ${expected.urgency}, got: ${outputs.urgency}`,
  });

  // contactInfoPresent: does the answer contain required contact info?
  const requiredContactInfo = Array.isArray(expected.requiredContactInfo)
    ? (expected.requiredContactInfo as string[])
    : [];
  const answer = String(outputs.answer ?? "");

  if (requiredContactInfo.length > 0) {
    const found = requiredContactInfo.filter((info) =>
      answer.toLowerCase().includes(info.toLowerCase()),
    );
    const score = found.length / requiredContactInfo.length;
    const missing = requiredContactInfo.filter(
      (info) => !answer.toLowerCase().includes(info.toLowerCase()),
    );

    results.push({
      key: "contact_info_present",
      score,
      comment:
        missing.length > 0
          ? `Missing contact info: ${missing.join(", ")}`
          : "All required contact info present",
    });
  } else {
    results.push({
      key: "contact_info_present",
      score: 1.0,
      comment: "No required contact info specified",
    });
  }

  return results;
}

/**
 * Runs the escalation evaluation suite.
 */
export async function run(): Promise<void> {
  await runEvalSuite({
    datasetName: DATASET_NAMES.escalation,
    experimentPrefix: "escalation-routing",
    description:
      "Deterministic escalation routing evaluation — route, target, urgency, and contact info verification",
    target: escalationTarget,
    evaluators: [escalationEvaluator],
    maxConcurrency: 3,
  });
}
