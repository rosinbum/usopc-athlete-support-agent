import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { logger } from "@usopc/shared";
import { MODEL_CONFIG } from "../../config/index.js";
import { buildClassifierPromptWithHistory } from "../../prompts/index.js";
import { buildContextualQuery } from "../../utils/index.js";
import type { AgentState } from "../state.js";
import type { TopicDomain, QueryIntent } from "../../types/index.js";

const log = logger.child({ service: "classifier-node" });

/**
 * Valid topic domains for guard-checking the classifier output.
 */
const VALID_DOMAINS: TopicDomain[] = [
  "team_selection",
  "dispute_resolution",
  "safesport",
  "anti_doping",
  "eligibility",
  "governance",
  "athlete_rights",
];

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
 * Parsed output from the classifier model.
 */
interface ClassifierOutput {
  topicDomain: TopicDomain;
  detectedNgbIds: string[];
  queryIntent: QueryIntent;
  hasTimeConstraint: boolean;
  shouldEscalate: boolean;
  escalationReason?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
}

/**
 * Extracts the text content from the last user message in the conversation.
 */
function getLastUserMessage(state: AgentState): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (
      msg._getType() === "human" ||
      (msg as unknown as Record<string, unknown>).role === "user"
    ) {
      return typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    }
  }
  return "";
}

/**
 * Parses the JSON response from the classifier model.
 * Returns a safe default if parsing fails.
 */
function parseClassifierResponse(raw: string): ClassifierOutput {
  // Strip any markdown code fences the model may have wrapped around the JSON
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const topicDomain = VALID_DOMAINS.includes(parsed.topicDomain as TopicDomain)
    ? (parsed.topicDomain as TopicDomain)
    : undefined;

  const queryIntent = VALID_INTENTS.includes(parsed.queryIntent as QueryIntent)
    ? (parsed.queryIntent as QueryIntent)
    : "general";

  const detectedNgbIds = Array.isArray(parsed.detectedNgbIds)
    ? (parsed.detectedNgbIds as string[]).filter(
        (id) => typeof id === "string" && id.length > 0,
      )
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

  return {
    topicDomain: topicDomain ?? "team_selection", // fallback handled below
    detectedNgbIds,
    queryIntent,
    hasTimeConstraint,
    shouldEscalate,
    escalationReason,
    needsClarification,
    clarificationQuestion,
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
export async function classifierNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  // Build contextual query from conversation history
  // TODO: Add conversation summarization for very long chats (#35)
  const { currentMessage, conversationContext } = buildContextualQuery(
    state.messages,
  );

  if (!currentMessage) {
    log.warn("Classifier received empty user message; defaulting state");
    return {
      queryIntent: "general",
      needsClarification: false,
    };
  }

  const model = new ChatAnthropic({
    model: MODEL_CONFIG.classifier.model,
    temperature: MODEL_CONFIG.classifier.temperature,
    maxTokens: MODEL_CONFIG.classifier.maxTokens,
  });

  const prompt = buildClassifierPromptWithHistory(
    currentMessage,
    conversationContext,
  );

  try {
    const response = await model.invoke([new HumanMessage(prompt)]);

    const responseText =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .filter(
                (block): block is { type: "text"; text: string } =>
                  typeof block === "object" &&
                  block !== null &&
                  "type" in block &&
                  block.type === "text",
              )
              .map((block) => block.text)
              .join("")
          : "";

    const result = parseClassifierResponse(responseText);

    log.info("Classification complete", {
      topicDomain: result.topicDomain,
      queryIntent: result.queryIntent,
      detectedNgbIds: result.detectedNgbIds,
      hasTimeConstraint: result.hasTimeConstraint,
      shouldEscalate: result.shouldEscalate,
      needsClarification: result.needsClarification,
    });

    return {
      topicDomain: result.topicDomain,
      detectedNgbIds: result.detectedNgbIds,
      queryIntent: result.shouldEscalate ? "escalation" : result.queryIntent,
      hasTimeConstraint: result.hasTimeConstraint,
      needsClarification: result.needsClarification,
      clarificationQuestion: result.clarificationQuestion,
    };
  } catch (error) {
    log.error("Classifier failed; falling back to defaults", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Graceful degradation: allow the pipeline to continue with
    // safe defaults so the user still gets a response.
    return {
      topicDomain: undefined,
      detectedNgbIds: [],
      queryIntent: "general",
      hasTimeConstraint: false,
      needsClarification: false,
    };
  }
}
