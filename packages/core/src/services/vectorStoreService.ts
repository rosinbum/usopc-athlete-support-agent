import {
  CircuitBreaker,
  logger,
  type CircuitBreakerMetrics,
} from "@usopc/shared";

const log = logger.child({ service: "vectorstore-circuit" });

/**
 * Circuit breaker for pgvector read operations.
 *
 * Configuration:
 * - failureThreshold: 5 (higher threshold for transient DB issues)
 * - resetTimeout: 15s (faster recovery for reads)
 * - requestTimeout: 10s (reads should be fast)
 */
const vectorStoreReadCircuit = new CircuitBreaker({
  name: "pgvector-read",
  failureThreshold: 5,
  resetTimeout: 15_000,
  requestTimeout: 10_000,
  successThreshold: 2,
  logger: log,
});

/**
 * Circuit breaker for pgvector write operations.
 *
 * Configuration:
 * - failureThreshold: 3 (lower threshold for writes)
 * - resetTimeout: 30s (longer recovery for write operations)
 * - requestTimeout: 30s (writes may take longer, especially batch ops)
 */
const vectorStoreWriteCircuit = new CircuitBreaker({
  name: "pgvector-write",
  failureThreshold: 3,
  resetTimeout: 30_000,
  requestTimeout: 30_000,
  successThreshold: 2,
  logger: log,
});

/**
 * Executes a vector store read operation through the circuit breaker.
 *
 * @param fn The read operation to execute
 * @throws {CircuitBreakerError} When the circuit is open
 * @throws The underlying error if the operation fails
 */
export async function vectorStoreRead<T>(fn: () => Promise<T>): Promise<T> {
  return vectorStoreReadCircuit.execute(fn);
}

/**
 * Executes a vector store read operation with a fallback value.
 * Useful for search operations where returning empty results is acceptable.
 *
 * @param fn The read operation to execute
 * @param fallback The fallback value or function to call on failure
 */
export async function vectorStoreSearch<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  return vectorStoreReadCircuit.executeWithFallback(fn, fallback);
}

/**
 * Executes a vector store write operation through the circuit breaker.
 *
 * @param fn The write operation to execute
 * @throws {CircuitBreakerError} When the circuit is open
 * @throws The underlying error if the operation fails
 */
export async function vectorStoreWrite<T>(fn: () => Promise<T>): Promise<T> {
  return vectorStoreWriteCircuit.execute(fn);
}

/**
 * Returns current metrics for the vector store read circuit breaker.
 */
export function getVectorStoreReadCircuitMetrics(): CircuitBreakerMetrics {
  return vectorStoreReadCircuit.getMetrics();
}

/**
 * Returns current metrics for the vector store write circuit breaker.
 */
export function getVectorStoreWriteCircuitMetrics(): CircuitBreakerMetrics {
  return vectorStoreWriteCircuit.getMetrics();
}

/**
 * Resets the vector store read circuit breaker to closed state.
 */
export function resetVectorStoreReadCircuit(): void {
  vectorStoreReadCircuit.reset();
}

/**
 * Resets the vector store write circuit breaker to closed state.
 */
export function resetVectorStoreWriteCircuit(): void {
  vectorStoreWriteCircuit.reset();
}
