import type { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { logger, CircuitBreakerError } from "@usopc/shared";
import { QUALITY_CHECKER_CONFIG } from "../../config/index.js";
import { buildQualityCheckerPrompt } from "../../prompts/index.js";
import {
  invokeAnthropic,
  extractTextFromResponse,
} from "../../services/anthropicService.js";
import {
  buildContextualQuery,
  stateContext,
  buildContext,
} from "../../utils/index.js";
import type { AgentState } from "../state.js";
import type { QualityCheckResult, QualityIssue } from "../../types/index.js";

const log = logger.child({ service: "quality-checker-node" });

/** Known error messages that should skip quality checking (fail-open). */
const KNOWN_ERROR_MESSAGES = [
  "I wasn't able to understand your question",
  "I was unable to search our knowledge base",
  "I'm temporarily unable to generate a response",
  "I encountered an error while generating your answer",
];

function isKnownErrorMessage(answer: string): boolean {
  return KNOWN_ERROR_MESSAGES.some((msg) => answer.startsWith(msg));
}

function makePassResult(): Partial<AgentState> {
  return {
    qualityCheckResult: {
      passed: true,
      score: 1.0,
      issues: [],
      critique: "",
    },
  };
}

/**
 * Determines whether the result should pass based on score and issue severity.
 */
function evaluateResult(result: QualityCheckResult): boolean {
  if (result.score < QUALITY_CHECKER_CONFIG.passThreshold) return false;
  const hasCritical = result.issues.some(
    (issue: QualityIssue) => issue.severity === "critical",
  );
  if (hasCritical) return false;
  return true;
}

/**
 * QUALITY CHECKER node.
 *
 * Evaluates the synthesized answer for specificity, grounding, and
 * completeness using Haiku (fast, cheap). Fail-open on all errors —
 * if anything goes wrong, the answer passes through unchanged.
 */
export function createQualityCheckerNode(model: ChatAnthropic) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    // Fail-open: skip if no answer or answer is a known error message
    if (!state.answer) {
      return makePassResult();
    }
    if (isKnownErrorMessage(state.answer)) {
      return makePassResult();
    }

    const { currentMessage } = buildContextualQuery(state.messages);
    if (!currentMessage) {
      return makePassResult();
    }

    const context = buildContext(state);
    const prompt = buildQualityCheckerPrompt(
      state.answer,
      currentMessage,
      context,
      state.queryIntent,
    );

    try {
      log.info("Running quality check", {
        answerLength: state.answer.length,
        retryCount: state.qualityRetryCount,
        ...stateContext(state),
      });

      const response = await invokeAnthropic(model, [new HumanMessage(prompt)]);
      let text = extractTextFromResponse(response).trim();

      // Strip markdown fences if present
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(text) as QualityCheckResult;

      // Determine pass/fail based on score + severity
      const passed = evaluateResult(parsed);

      const qualityCheckResult: QualityCheckResult = {
        passed,
        score: parsed.score,
        issues: parsed.issues ?? [],
        critique: parsed.critique ?? "",
      };

      log.info("Quality check complete", {
        passed,
        score: parsed.score,
        issueCount: qualityCheckResult.issues.length,
      });

      return { qualityCheckResult };
    } catch (error) {
      // Fail-open: any error means the answer passes through
      if (error instanceof CircuitBreakerError) {
        log.warn("Quality checker circuit open; passing through", {
          ...stateContext(state),
        });
      } else {
        log.warn("Quality check failed; passing through", {
          error: error instanceof Error ? error.message : String(error),
          ...stateContext(state),
        });
      }
      return makePassResult();
    }
  };
}
