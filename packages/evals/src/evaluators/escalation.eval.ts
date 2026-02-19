import * as ls from "langsmith/vitest";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import {
  createClassifierNode,
  createEscalateNode,
  getModelConfig,
  routeByDomain,
} from "@usopc/core";
import { DATASET_NAMES } from "../config.js";
import { makeTestState } from "../helpers/stateFactory.js";
import { fetchExamples } from "../helpers/fetchExamples.js";

const modelConfig = await getModelConfig();
const classifierModel = new ChatAnthropic({
  model: modelConfig.classifier.model,
  temperature: modelConfig.classifier.temperature,
  maxTokens: modelConfig.classifier.maxTokens,
});
const agentModel = new ChatAnthropic({
  model: modelConfig.agent.model,
  temperature: modelConfig.agent.temperature,
  maxTokens: modelConfig.agent.maxTokens,
});
const classifierNode = createClassifierNode(classifierModel);
const escalateNode = createEscalateNode(agentModel);

const examples = await fetchExamples(DATASET_NAMES.escalation);

ls.describe("usopc-escalation", () => {
  ls.test.each(examples)(
    "escalation routing",
    async ({ inputs, referenceOutputs }) => {
      const message = String(inputs.message ?? "");
      const state = makeTestState({
        messages: [new HumanMessage(message)],
      });

      // Run classifier
      const classResult = await classifierNode(state);
      const postClassState = { ...state, ...classResult };

      // Check routing
      const route = routeByDomain(postClassState);

      let outputs: Record<string, unknown>;

      if (route !== "escalate") {
        outputs = {
          routed: route,
          escalationTarget: null,
          urgency: null,
          answer: null,
        };
      } else {
        // Run escalation node
        const escResult = await escalateNode(postClassState);
        outputs = {
          routed: route,
          escalationTarget: escResult.escalation?.target ?? null,
          urgency: escResult.escalation?.urgency ?? null,
          answer: escResult.answer ?? "",
          contactEmail: escResult.escalation?.contactEmail ?? null,
          contactPhone: escResult.escalation?.contactPhone ?? null,
          contactUrl: escResult.escalation?.contactUrl ?? null,
        };
      }

      ls.logOutputs(outputs);

      const expected = referenceOutputs ?? {};

      // routeCorrect: did the agent route to "escalate"?
      const routeScore = outputs.routed === "escalate" ? 1.0 : 0.0;
      ls.logFeedback({ key: "route_correct", score: routeScore });

      // targetCorrect: does the escalation target match?
      const targetScore =
        outputs.escalationTarget === expected.escalationTarget ? 1.0 : 0.0;
      ls.logFeedback({ key: "target_correct", score: targetScore });

      // urgencyCorrect: does the urgency match?
      const urgencyScore = outputs.urgency === expected.urgency ? 1.0 : 0.0;
      ls.logFeedback({ key: "urgency_correct", score: urgencyScore });

      // contactInfoPresent: does the answer contain required contact info?
      const requiredContactInfo = Array.isArray(expected.requiredContactInfo)
        ? (expected.requiredContactInfo as string[])
        : [];
      const answer = String(outputs.answer ?? "");

      let contactScore: number;
      if (requiredContactInfo.length > 0) {
        const found = requiredContactInfo.filter((info) =>
          answer.toLowerCase().includes((info as string).toLowerCase()),
        );
        contactScore = found.length / requiredContactInfo.length;
      } else {
        contactScore = 1.0;
      }
      ls.logFeedback({ key: "contact_info_present", score: contactScore });
    },
  );
});
