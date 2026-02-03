import type { Citation, EscalationInfo } from "../types/index.js";
import type { AgentState } from "./state.js";
import type { StreamChunk } from "./runner.js";

export interface AgentStreamEvent {
  type: "text-delta" | "citations" | "escalation" | "done";
  textDelta?: string;
  citations?: Citation[];
  escalation?: EscalationInfo;
}

/**
 * Nodes that should emit token-level streaming.
 * We only stream tokens from synthesizer to avoid showing
 * classifier JSON output or other intermediate data.
 */
const STREAMING_NODES = new Set(["synthesizer"]);

/**
 * Extracts text content from an AIMessageChunk's content field.
 * Handles both string and array content formats.
 */
function extractTextFromContent(
  content: string | Array<{ type: string; text?: string }>,
): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(
        (block) => block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text!)
      .join("");
  }
  return "";
}

/**
 * Converts a LangGraph dual-mode stream into a sequence of AgentStreamEvents.
 *
 * Handles two stream modes:
 * - "values": Full state after each node. Used for citations, escalation,
 *   and answer from non-LLM nodes (like clarify).
 * - "messages": Token-by-token LLM output. Used for real-time text streaming.
 *
 * Only emits tokens from the synthesizer node to avoid showing
 * classifier JSON or other intermediate output.
 */
export async function* agentStreamToEvents(
  stream: AsyncIterable<StreamChunk>,
): AsyncGenerator<AgentStreamEvent> {
  let citationsEmitted = false;
  let escalationEmitted = false;
  // Track answer from values mode for nodes that don't use LLM streaming
  // (like clarify, escalate fallbacks, error handlers)
  let previousAnswerFromValues = "";
  // Track if we've seen any messages from synthesizer - if so, don't emit
  // answer from values to avoid duplication
  let seenSynthesizerTokens = false;

  for await (const chunk of stream) {
    const [mode, data] = chunk;

    if (mode === "messages") {
      // Token streaming from LLM calls
      const [messageChunk, metadata] = data as [
        { content: string | Array<{ type: string; text?: string }> },
        { langgraph_node?: string },
      ];

      // Only stream tokens from specific nodes (synthesizer)
      const nodeName = metadata?.langgraph_node;
      if (nodeName && STREAMING_NODES.has(nodeName)) {
        seenSynthesizerTokens = true;
        const text = extractTextFromContent(messageChunk.content);
        if (text) {
          yield { type: "text-delta", textDelta: text };
        }
      }
    } else if (mode === "values") {
      // State update after a node completes
      const state = data as Partial<AgentState>;

      // Emit answer changes from nodes that don't use LLM streaming
      // (clarify, escalate, error handlers). Only if we haven't seen
      // synthesizer tokens to avoid duplication.
      if (
        !seenSynthesizerTokens &&
        state.answer !== undefined &&
        state.answer.length > previousAnswerFromValues.length
      ) {
        const delta = state.answer.slice(previousAnswerFromValues.length);
        previousAnswerFromValues = state.answer;
        yield { type: "text-delta", textDelta: delta };
      }

      // Emit citations once when they first appear (non-empty)
      if (!citationsEmitted && state.citations && state.citations.length > 0) {
        citationsEmitted = true;
        yield { type: "citations", citations: state.citations };
      }

      // Emit escalation once when it first appears
      if (!escalationEmitted && state.escalation) {
        escalationEmitted = true;
        yield { type: "escalation", escalation: state.escalation };
      }
    }
  }

  yield { type: "done" };
}

/**
 * Legacy adapter for state-only streaming.
 * Used when running with streamMode: "values" only.
 *
 * @deprecated Use agentStreamToEvents with dual-mode streaming instead.
 */
export async function* legacyStateStreamToEvents(
  stateStream: AsyncIterable<Partial<AgentState>>,
): AsyncGenerator<AgentStreamEvent> {
  let previousAnswer = "";
  let citationsEmitted = false;
  let escalationEmitted = false;

  for await (const state of stateStream) {
    // Emit text delta if the answer grew
    if (
      state.answer !== undefined &&
      state.answer.length > previousAnswer.length
    ) {
      const delta = state.answer.slice(previousAnswer.length);
      previousAnswer = state.answer;
      yield { type: "text-delta", textDelta: delta };
    }

    // Emit citations once when they first appear (non-empty)
    if (!citationsEmitted && state.citations && state.citations.length > 0) {
      citationsEmitted = true;
      yield { type: "citations", citations: state.citations };
    }

    // Emit escalation once when it first appears
    if (!escalationEmitted && state.escalation) {
      escalationEmitted = true;
      yield { type: "escalation", escalation: state.escalation };
    }
  }

  yield { type: "done" };
}
