import {
  CircuitBreaker,
  logger,
  type CircuitBreakerMetrics,
} from "@usopc/shared";
import type { TavilySearchLike } from "../agent/nodes/researcher.js";

const log = logger.child({ service: "tavily-circuit" });

export type { TavilySearchLike };

/**
 * Circuit breaker for Tavily web search API calls.
 *
 * Configuration:
 * - failureThreshold: 3 (opens after 3 consecutive failures)
 * - resetTimeout: 30s (web search is a supplementary source)
 * - requestTimeout: 15s (web search should be fast)
 */
const tavilyCircuit = new CircuitBreaker({
  name: "tavily",
  failureThreshold: 3,
  resetTimeout: 30_000,
  requestTimeout: 15_000,
  successThreshold: 2,
  logger: log,
});

/**
 * Performs a web search through the circuit breaker.
 *
 * @param search The Tavily search instance
 * @param query The search query
 * @throws {CircuitBreakerError} When the circuit is open
 * @throws The underlying error if search fails
 */
export async function searchWithTavily(
  search: TavilySearchLike,
  query: string,
): Promise<unknown> {
  return tavilyCircuit.execute(() => search.invoke({ query }));
}

/**
 * Performs a web search with fallback to empty result when circuit is open.
 * Useful when web search is supplementary and the synthesizer can continue
 * with document-only results.
 *
 * @param search The Tavily search instance
 * @param query The search query
 * @returns Search results or empty string on failure
 */
export async function searchWithTavilyFallback(
  search: TavilySearchLike,
  query: string,
): Promise<unknown> {
  return tavilyCircuit.executeWithFallback(
    () => search.invoke({ query }),
    "", // Empty result allows synthesizer to continue with documents only
  );
}

/**
 * Returns current metrics for the Tavily circuit breaker.
 */
export function getTavilyCircuitMetrics(): CircuitBreakerMetrics {
  return tavilyCircuit.getMetrics();
}

/**
 * Resets the Tavily circuit breaker to closed state.
 * Useful for testing or manual recovery.
 */
export function resetTavilyCircuit(): void {
  tavilyCircuit.reset();
}
