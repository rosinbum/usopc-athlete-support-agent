import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import {
  CircuitBreaker,
  CircuitBreakerError,
  logger,
  type CircuitBreakerMetrics,
} from "@usopc/shared";

const log = logger.child({ service: "llm-circuit" });

/** Delay between retry attempts (ms). */
const RETRY_DELAY_MS = 1_000;

/**
 * Circuit breaker for LLM calls.
 *
 * Configuration:
 * - failureThreshold: 3 (opens after 3 consecutive failures)
 * - resetTimeout: 60s (longer because LLM calls are critical)
 * - requestTimeout: 30s (LLM calls can be slow)
 */
const llmCircuit = new CircuitBreaker({
  name: "llm",
  failureThreshold: 3,
  resetTimeout: 60_000,
  requestTimeout: 30_000,
  successThreshold: 2,
  logger: log,
});

/**
 * Returns true for errors that are likely transient and worth retrying:
 * network errors, timeouts, and HTTP 429/500/502/503/529.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof CircuitBreakerError) return false;

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network / timeout errors
    if (
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("socket hang up") ||
      msg.includes("network") ||
      msg.includes("timeout")
    ) {
      return true;
    }

    // HTTP status codes in error messages (common with LangChain API errors)
    const statusMatch = msg.match(/\b(429|500|502|503|529)\b/);
    if (statusMatch) return true;

    // Check for status property on the error object
    const errRecord = error as unknown as Record<string, unknown>;
    const statusCode = errRecord.status ?? errRecord.statusCode;
    if (typeof statusCode === "number") {
      return [429, 500, 502, 503, 529].includes(statusCode);
    }
  }

  return false;
}

/**
 * Retries a function once after a short delay if it fails with a transient
 * error. Non-transient errors are rethrown immediately.
 */
export async function withSingleRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isTransientError(error)) throw error;

    log.warn("Transient error, retrying once", {
      operation: operationName,
      error: error instanceof Error ? error.message : String(error),
    });

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return await fn();
  }
}

/**
 * Extracts text content from an AIMessage response.
 */
export function extractTextFromResponse(response: AIMessage): string {
  if (typeof response.content === "string") {
    return response.content;
  }

  if (Array.isArray(response.content)) {
    return response.content
      .filter(
        (block): block is { type: "text"; text: string } =>
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "text",
      )
      .map((block) => block.text)
      .join("");
  }

  return "";
}

/**
 * Invokes an LLM through the circuit breaker with a single retry for
 * transient errors. The retry happens *inside* the circuit breaker so the
 * breaker only sees the final outcome.
 *
 * @throws {CircuitBreakerError} When the circuit is open
 * @throws The underlying error if the model invocation fails
 */
export async function invokeLlm(
  model: BaseChatModel,
  messages: BaseMessage[],
): Promise<AIMessage> {
  return llmCircuit.execute(() =>
    withSingleRetry(
      () => model.invoke(messages) as Promise<AIMessage>,
      "invokeLlm",
    ),
  );
}

/**
 * Invokes an LLM with a fallback response when the circuit is open.
 *
 * @param model The BaseChatModel instance
 * @param messages The messages to send
 * @param fallback A fallback AIMessage or function to produce one
 */
export async function invokeLlmWithFallback(
  model: BaseChatModel,
  messages: BaseMessage[],
  fallback: AIMessage | (() => AIMessage | Promise<AIMessage>),
): Promise<AIMessage> {
  return llmCircuit.executeWithFallback(
    () =>
      withSingleRetry(
        () => model.invoke(messages) as Promise<AIMessage>,
        "invokeLlm",
      ),
    fallback,
  );
}

/**
 * Returns current metrics for the LLM circuit breaker.
 */
export function getLlmCircuitMetrics(): CircuitBreakerMetrics {
  return llmCircuit.getMetrics();
}

/**
 * Resets the LLM circuit breaker to closed state.
 * Useful for testing or manual recovery.
 */
export function resetLlmCircuit(): void {
  llmCircuit.reset();
}
