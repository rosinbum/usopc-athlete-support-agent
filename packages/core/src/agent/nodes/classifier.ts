import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import {
  logger,
  CircuitBreakerError,
  NGB_ID_SET,
  TOPIC_DOMAINS,
} from "@usopc/shared";
import { buildClassifierPromptWithHistory } from "../../prompts/index.js";
import {
  invokeLlm,
  extractTextFromResponse,
} from "../../services/llmService.js";
import {
  buildContextualQuery,
  stateContext,
  parseLlmJson,
} from "../../utils/index.js";
import type { AgentState } from "../state.js";
import type {
  TopicDomain,
  QueryIntent,
  EmotionalState,
} from "../../types/index.js";

const log = logger.child({ service: "classifier-node" });

/**
 * Valid topic domains for guard-checking the classifier output.
 * Single source of truth: TOPIC_DOMAINS from @usopc/shared.
 */
const VALID_DOMAINS: readonly string[] = TOPIC_DOMAINS;

/**
 * Valid query intents for guard-checking the classifier output.
 */
const VALID_INTENTS: QueryIntent[] = [
  "factual",
  "procedural",
  "deadline",
  "escalation",
  "general",
];

/**
 * Valid emotional states for guard-checking the classifier output.
 */
const VALID_EMOTIONAL_STATES: EmotionalState[] = [
  "neutral",
  "distressed",
  "panicked",
  "fearful",
];

/**
 * Parsed output from the classifier model.
 */
interface ClassifierOutput {
  topicDomain: TopicDomain | undefined;
  detectedNgbIds: string[];
  queryIntent: QueryIntent;
  hasTimeConstraint: boolean;
  shouldEscalate: boolean;
  escalationReason?: string | undefined;
  needsClarification: boolean;
  clarificationQuestion?: string | undefined;
  emotionalState: EmotionalState;
}

interface ParseResult {
  output: ClassifierOutput;
  warnings: string[];
}

/**
 * Parses the JSON response from the classifier model.
 * Returns a safe default if parsing fails, and collects warnings
 * for any fields that were invalid but coerced.
 */
export function parseClassifierResponse(raw: string): ParseResult {
  const warnings: string[] = [];

  const parsed = parseLlmJson(raw);

  let topicDomain: TopicDomain | undefined;
  if (VALID_DOMAINS.includes(parsed.topicDomain as TopicDomain)) {
    topicDomain = parsed.topicDomain as TopicDomain;
  } else if (parsed.topicDomain !== undefined) {
    warnings.push(`Invalid topicDomain: "${String(parsed.topicDomain)}"`);
  }

  let queryIntent: QueryIntent;
  if (VALID_INTENTS.includes(parsed.queryIntent as QueryIntent)) {
    queryIntent = parsed.queryIntent as QueryIntent;
  } else {
    queryIntent = "general";
    if (parsed.queryIntent !== undefined) {
      warnings.push(`Invalid queryIntent: "${String(parsed.queryIntent)}"`);
    }
  }

  const detectedNgbIds = Array.isArray(parsed.detectedNgbIds)
    ? (parsed.detectedNgbIds as string[]).filter((id) => {
        if (typeof id !== "string" || id.length === 0) return false;
        if (!NGB_ID_SET.has(id)) {
          warnings.push(`Unrecognized ngbId filtered out: "${id}"`);
          return false;
        }
        return true;
      })
    : [];

  const hasTimeConstraint =
    typeof parsed.hasTimeConstraint === "boolean"
      ? parsed.hasTimeConstraint
      : false;

  const shouldEscalate =
    typeof parsed.shouldEscalate === "boolean" ? parsed.shouldEscalate : false;

  const escalationReason =
    typeof parsed.escalationReason === "string"
      ? parsed.escalationReason
      : undefined;

  const needsClarification =
    typeof parsed.needsClarification === "boolean"
      ? parsed.needsClarification
      : false;

  const clarificationQuestion =
    typeof parsed.clarificationQuestion === "string"
      ? parsed.clarificationQuestion
      : undefined;

  let emotionalState: EmotionalState = "neutral";
  if (
    VALID_EMOTIONAL_STATES.includes(parsed.emotionalState as EmotionalState)
  ) {
    emotionalState = parsed.emotionalState as EmotionalState;
  } else if (parsed.emotionalState !== undefined) {
    warnings.push(`Invalid emotionalState: "${String(parsed.emotionalState)}"`);
  }

  return {
    output: {
      topicDomain,
      detectedNgbIds,
      queryIntent,
      hasTimeConstraint,
      shouldEscalate,
      escalationReason,
      needsClarification,
      clarificationQuestion,
      emotionalState,
    },
    warnings,
  };
}

/**
 * CLASSIFIER node.
 *
 * Analyzes the latest user message using Claude Haiku to extract:
 * - topicDomain: which area of athlete support the question pertains to
 * - detectedNgbIds: any NGB identifiers mentioned or implied
 * - queryIntent: what kind of answer the user is looking for
 * - hasTimeConstraint: whether urgency signals are present
 * - needsClarification: whether the query is too ambiguous
 * - clarificationQuestion: what to ask to clarify
 *
 * The `shouldEscalate` flag from the classifier output is encoded into
 * the state as `queryIntent === "escalation"` so downstream conditional
 * edges can route accordingly.
 */
export function createClassifierNode(model: BaseChatModel) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    // Build contextual query from conversation history
    const { currentMessage, conversationContext } = buildContextualQuery(
      state.messages,
      { conversationSummary: state.conversationSummary },
    );

    if (!currentMessage) {
      log.warn("Classifier received empty user message; defaulting state");
      return {
        queryIntent: "general",
        needsClarification: false,
        emotionalState: "neutral",
      };
    }

    const prompt = buildClassifierPromptWithHistory(
      currentMessage,
      conversationContext,
    );

    try {
      const response = await invokeLlm(model, [new HumanMessage(prompt)]);
      const responseText = extractTextFromResponse(response);
      const { output: result, warnings } =
        parseClassifierResponse(responseText);

      if (warnings.length > 0) {
        log.warn("Classifier response had coerced fields", {
          warnings,
          ...stateContext(state),
        });
      }

      log.info("Classification complete", {
        topicDomain: result.topicDomain,
        queryIntent: result.queryIntent,
        detectedNgbIds: result.detectedNgbIds,
        hasTimeConstraint: result.hasTimeConstraint,
        shouldEscalate: result.shouldEscalate,
        needsClarification: result.needsClarification,
        emotionalState: result.emotionalState,
        ...stateContext(state),
      });

      return {
        topicDomain: result.topicDomain,
        detectedNgbIds: result.detectedNgbIds,
        queryIntent: result.shouldEscalate ? "escalation" : result.queryIntent,
        hasTimeConstraint: result.hasTimeConstraint,
        needsClarification: result.needsClarification,
        clarificationQuestion: result.clarificationQuestion,
        emotionalState: result.emotionalState,
        escalationReason: result.escalationReason,
      };
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        log.warn("Classifier circuit open; falling back to defaults", {
          ...stateContext(state),
        });
      } else {
        log.error("Classifier failed; falling back to defaults", {
          error: error instanceof Error ? error.message : String(error),
          ...stateContext(state),
        });
      }

      // Graceful degradation: allow the pipeline to continue with
      // safe defaults so the user still gets a response.
      return {
        topicDomain: undefined,
        detectedNgbIds: [],
        queryIntent: "general",
        hasTimeConstraint: false,
        needsClarification: false,
        emotionalState: "neutral",
      };
    }
  };
}
