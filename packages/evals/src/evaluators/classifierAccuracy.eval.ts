import * as ls from "langsmith/vitest";
import { HumanMessage } from "@langchain/core/messages";
import {
  createClassifierNode,
  createAgentModels,
  routeByDomain,
} from "@usopc/core";
import { DATASET_NAMES } from "../config.js";
import { makeTestState } from "../helpers/stateFactory.js";
import { fetchExamples } from "../helpers/fetchExamples.js";

const { classifierModel } = await createAgentModels();
const classifierNode = createClassifierNode(classifierModel);

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

const examples = await fetchExamples(DATASET_NAMES.classifier);

ls.describe("usopc-classifier", () => {
  ls.test.each(examples)(
    "classifier accuracy",
    async ({ inputs, referenceOutputs }) => {
      const message = String(inputs.message ?? "");
      const state = makeTestState({
        messages: [new HumanMessage(message)],
      });

      const result = await classifierNode(state);

      // Determine shouldEscalate from the routing decision
      const postState = { ...state, ...result };
      const route = routeByDomain(postState);

      const outputs = {
        topicDomain: result.topicDomain ?? "team_selection",
        queryIntent: result.queryIntent ?? "general",
        detectedNgbIds: result.detectedNgbIds ?? [],
        shouldEscalate: route === "escalate",
        needsClarification: result.needsClarification ?? false,
      };

      ls.logOutputs(outputs);

      const expected = referenceOutputs ?? {};

      // topicDomain — exact match
      const topicDomainScore =
        outputs.topicDomain === expected.topicDomain ? 1.0 : 0.0;
      ls.logFeedback({ key: "topic_domain_accuracy", score: topicDomainScore });

      // queryIntent — exact match
      const queryIntentScore =
        outputs.queryIntent === expected.queryIntent ? 1.0 : 0.0;
      ls.logFeedback({ key: "query_intent_accuracy", score: queryIntentScore });

      // detectedNgbIds — Jaccard similarity
      const actualNgbs = Array.isArray(outputs.detectedNgbIds)
        ? (outputs.detectedNgbIds as string[])
        : [];
      const expectedNgbs = Array.isArray(expected.detectedNgbIds)
        ? (expected.detectedNgbIds as string[])
        : [];
      const ngbScore = jaccardSimilarity(actualNgbs, expectedNgbs);
      ls.logFeedback({ key: "ngb_detection_jaccard", score: ngbScore });

      // shouldEscalate — exact match
      const escalationScore =
        outputs.shouldEscalate === expected.shouldEscalate ? 1.0 : 0.0;
      ls.logFeedback({ key: "escalation_accuracy", score: escalationScore });

      // needsClarification — exact match
      const clarificationScore =
        outputs.needsClarification === expected.needsClarification ? 1.0 : 0.0;
      ls.logFeedback({
        key: "clarification_accuracy",
        score: clarificationScore,
      });
    },
  );
});
