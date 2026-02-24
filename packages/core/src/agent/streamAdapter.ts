import { AppError } from "@usopc/shared";
import { TimeoutError } from "../utils/withTimeout.js";
import { QUALITY_CHECKER_CONFIG } from "../config/index.js";
import type {
  Citation,
  EscalationInfo,
  WebSearchResult,
} from "../types/index.js";
import type { AgentState } from "./state.js";
import type { StreamChunk } from "./runner.js";

export interface AgentStreamEvent {
  type:
    | "text-delta"
    | "citations"
    | "escalation"
    | "answer-reset"
    | "discovered-urls"
    | "status"
    | "error"
    | "done";
  textDelta?: string;
  citations?: Citation[];
  escalation?: EscalationInfo;
  discoveredUrls?: WebSearchResult[];
  status?: string;
  error?: { message: string; code?: string };
}

/**
 * Nodes that should emit token-level streaming.
 * We only stream tokens from synthesizer to avoid showing
 * classifier JSON output or other intermediate data.
 */
const STREAMING_NODES = new Set(["synthesizer"]);

/**
 * Human-readable status labels for LLM-calling graph nodes.
 * Nodes not listed here (emotionalSupport, citationBuilder, disclaimerGuard,
 * clarify) are either too fast or produce the final answer directly.
 */
const NODE_STATUS_LABELS: Record<string, string> = {
  classifier: "Understanding your question...",
  queryPlanner: "Planning search strategy...",
  retriever: "Searching governance documents...",
  retrievalExpander: "Broadening search...",
  researcher: "Searching the web...",
  synthesizer: "Preparing your answer...",
  qualityChecker: "Reviewing answer quality...",
  escalate: "Preparing your answer...",
};

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
 * Maps an error to an error code string for the stream event.
 */
function errorToCode(error: unknown): string {
  if (error instanceof TimeoutError) return "GRAPH_TIMEOUT";
  if (error instanceof AppError && error.code) return error.code;
  return "GRAPH_ERROR";
}

/**
 * Converts a LangGraph dual-mode stream into a sequence of AgentStreamEvents.
 *
 * Handles two stream modes:
 * - "values": Full state after each node. Used for citations, escalation,
 *   and answer from non-LLM nodes (like clarify).
 * - "messages": Token-by-token LLM output. Used for real-time text streaming.
 *
 * Synthesizer tokens are **buffered** until the quality check resolves:
 * - Quality passes → flush buffer (rapid token-by-token appearance)
 * - Quality fails with retries left → discard buffer (retry will produce new tokens)
 * - Quality fails with retries exhausted → flush buffer (answer is final)
 * - No quality check (clarify/escalate) → buffer flushed at stream end
 *
 * This eliminates duplicate content caused by quality-check retries.
 *
 * On stream error, emits an "error" event followed by "done" instead of
 * throwing, so callers can handle the error gracefully.
 */
export async function* agentStreamToEvents(
  stream: AsyncIterable<StreamChunk>,
): AsyncGenerator<AgentStreamEvent> {
  let citationsEmitted = false;
  let escalationEmitted = false;
  let lastDiscoveredUrls: WebSearchResult[] = [];
  let streamErrored = false;
  // Track answer from values mode for nodes that don't use LLM streaming
  // (like clarify, escalate fallbacks, error handlers)
  let previousAnswerFromValues = "";
  // Buffer synthesizer tokens until quality check resolves
  let synthBuffer: AgentStreamEvent[] = [];
  // Whether the buffer has been flushed (tokens sent to consumer)
  let bufferFlushed = false;
  // Track which node's status we last emitted to avoid duplicates
  let lastStatusNode = "";
  // Track whether retriever status was emitted from values mode
  let retrieverStatusEmitted = false;
  // JSON of last processed quality check result for staleness detection
  let lastProcessedQualityJSON = "";

  try {
    for await (const chunk of stream) {
      const [mode, data] = chunk;

      if (mode === "messages") {
        // Token streaming from LLM calls
        const [messageChunk, metadata] = data as [
          { content: string | Array<{ type: string; text?: string }> },
          { langgraph_node?: string },
        ];

        const nodeName = metadata?.langgraph_node;

        // Emit status update when the active node changes.
        // Suppress after buffer has been flushed (user is seeing text-deltas).
        if (
          nodeName &&
          nodeName !== lastStatusNode &&
          !bufferFlushed &&
          NODE_STATUS_LABELS[nodeName]
        ) {
          lastStatusNode = nodeName;
          yield { type: "status", status: NODE_STATUS_LABELS[nodeName] };
        }

        // Buffer tokens from synthesizer (instead of yielding immediately)
        if (nodeName && STREAMING_NODES.has(nodeName)) {
          const text = extractTextFromContent(messageChunk.content);
          if (text) {
            synthBuffer.push({ type: "text-delta", textDelta: text });
          }
        }
      } else if (mode === "values") {
        // State update after a node completes
        const state = data as Partial<AgentState>;

        // Emit retriever status when retrievedDocuments first appears
        if (
          !retrieverStatusEmitted &&
          !bufferFlushed &&
          state.retrievedDocuments &&
          state.retrievedDocuments.length > 0
        ) {
          retrieverStatusEmitted = true;
          if (lastStatusNode !== "retriever") {
            lastStatusNode = "retriever";
            yield {
              type: "status",
              status: NODE_STATUS_LABELS["retriever"]!,
            };
          }
        }

        // Handle quality check results — flush or discard the synthesizer buffer
        if (state.qualityCheckResult && synthBuffer.length > 0) {
          const qualityJSON = JSON.stringify(state.qualityCheckResult);

          // Only process if this is a NEW quality check result (not stale from
          // a previous node's cumulative state emission)
          if (qualityJSON !== lastProcessedQualityJSON) {
            lastProcessedQualityJSON = qualityJSON;

            if (state.qualityCheckResult.passed) {
              // Quality passed — flush buffer
              for (const event of synthBuffer) yield event;
              synthBuffer = [];
              bufferFlushed = true;
              previousAnswerFromValues = state.answer ?? "";
            } else {
              const retryCount = state.qualityRetryCount ?? 0;

              if (retryCount >= QUALITY_CHECKER_CONFIG.maxRetries) {
                // Retries exhausted — flush buffer (answer is final despite failing)
                for (const event of synthBuffer) yield event;
                synthBuffer = [];
                bufferFlushed = true;
                previousAnswerFromValues = state.answer ?? "";
              } else {
                // Retry coming — discard buffer
                synthBuffer = [];
                previousAnswerFromValues = state.answer ?? "";
                // Reset lastStatusNode so retry synthesizer re-emits its status
                lastStatusNode = "";
              }
            }
          }
        }

        // Emit answer changes from nodes that don't use LLM streaming
        // (clarify, escalate, error handlers). Only when no tokens are
        // being buffered (synthBuffer empty) to avoid duplication.
        if (
          synthBuffer.length === 0 &&
          state.answer !== undefined &&
          state.answer.length > previousAnswerFromValues.length
        ) {
          const delta = state.answer.slice(previousAnswerFromValues.length);
          previousAnswerFromValues = state.answer;
          yield { type: "text-delta", textDelta: delta };
        }

        // Emit citations once when they first appear (non-empty)
        if (
          !citationsEmitted &&
          state.citations &&
          state.citations.length > 0
        ) {
          citationsEmitted = true;
          yield { type: "citations", citations: state.citations };
        }

        // Emit escalation once when it first appears
        if (!escalationEmitted && state.escalation) {
          escalationEmitted = true;
          yield { type: "escalation", escalation: state.escalation };
        }

        // Track discovered URLs from the latest state (researcher node)
        if (state.webSearchResultUrls && state.webSearchResultUrls.length > 0) {
          lastDiscoveredUrls = state.webSearchResultUrls;
        }
      }
    }
  } catch (error) {
    // Flush any buffered tokens before the error event so partial content shows
    for (const event of synthBuffer) yield event;
    synthBuffer = [];

    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    const code = errorToCode(error);

    streamErrored = true;
    yield { type: "error", error: { message, code } };
  }

  // Safety net: flush remaining buffer at stream end (e.g., no quality check path)
  for (const event of synthBuffer) yield event;
  synthBuffer = [];

  // Emit discovered URLs once at the end of the stream (skip on error)
  if (!streamErrored && lastDiscoveredUrls.length > 0) {
    yield { type: "discovered-urls", discoveredUrls: lastDiscoveredUrls };
  }

  yield { type: "done" };
}
