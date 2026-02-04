import type { ChatAnthropic } from "@langchain/anthropic";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import {
  CircuitBreaker,
  logger,
  type CircuitBreakerMetrics,
} from "@usopc/shared";

const log = logger.child({ service: "anthropic-circuit" });

/**
 * Circuit breaker for Anthropic LLM calls.
 *
 * Configuration:
 * - failureThreshold: 3 (opens after 3 consecutive failures)
 * - resetTimeout: 60s (longer because LLM calls are critical)
 * - requestTimeout: 30s (LLM calls can be slow)
 */
const anthropicCircuit = new CircuitBreaker({
  name: "anthropic",
  failureThreshold: 3,
  resetTimeout: 60_000,
  requestTimeout: 30_000,
  successThreshold: 2,
  logger: log,
});

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
 * Invokes an Anthropic model through the circuit breaker.
 *
 * @throws {CircuitBreakerError} When the circuit is open
 * @throws The underlying error if the model invocation fails
 */
export async function invokeAnthropic(
  model: ChatAnthropic,
  messages: BaseMessage[],
): Promise<AIMessage> {
  return anthropicCircuit.execute(() => model.invoke(messages));
}

/**
 * Invokes an Anthropic model with a fallback response when the circuit is open.
 *
 * @param model The ChatAnthropic instance
 * @param messages The messages to send
 * @param fallback A fallback AIMessage or function to produce one
 */
export async function invokeAnthropicWithFallback(
  model: ChatAnthropic,
  messages: BaseMessage[],
  fallback: AIMessage | (() => AIMessage | Promise<AIMessage>),
): Promise<AIMessage> {
  return anthropicCircuit.executeWithFallback(
    () => model.invoke(messages),
    fallback,
  );
}

/**
 * Returns current metrics for the Anthropic circuit breaker.
 */
export function getAnthropicCircuitMetrics(): CircuitBreakerMetrics {
  return anthropicCircuit.getMetrics();
}

/**
 * Resets the Anthropic circuit breaker to closed state.
 * Useful for testing or manual recovery.
 */
export function resetAnthropicCircuit(): void {
  anthropicCircuit.reset();
}
