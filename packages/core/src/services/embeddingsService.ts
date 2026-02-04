import { OpenAIEmbeddings } from "@langchain/openai";
import {
  CircuitBreaker,
  logger,
  type CircuitBreakerMetrics,
} from "@usopc/shared";
import { MODEL_CONFIG } from "../config/index.js";

const log = logger.child({ service: "embeddings-circuit" });

/**
 * Circuit breaker for OpenAI embeddings API calls.
 *
 * Configuration:
 * - failureThreshold: 3 (opens after 3 consecutive failures)
 * - resetTimeout: 60s (longer because embeddings are critical for RAG)
 * - requestTimeout: 30s (batch embeddings can be slow)
 * - shouldRecordFailure: ignores quota errors (they're expected and handled elsewhere)
 */
const embeddingsCircuit = new CircuitBreaker({
  name: "openai-embeddings",
  failureThreshold: 3,
  resetTimeout: 60_000,
  requestTimeout: 30_000,
  successThreshold: 2,
  logger: log,
  shouldRecordFailure: (error) => !error.message.includes("insufficient_quota"),
});

/**
 * Circuit-protected OpenAI embeddings wrapper.
 *
 * Provides the same interface as OpenAIEmbeddings but routes
 * all calls through a circuit breaker.
 */
export class ProtectedOpenAIEmbeddings {
  private readonly embeddings: OpenAIEmbeddings;

  constructor(apiKey?: string) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey ?? process.env.OPENAI_API_KEY,
      modelName: MODEL_CONFIG.embeddings.model,
      dimensions: MODEL_CONFIG.embeddings.dimensions,
    });
  }

  /**
   * Embed multiple documents through the circuit breaker.
   *
   * @throws {CircuitBreakerError} When the circuit is open
   * @throws The underlying error if embedding fails
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    return embeddingsCircuit.execute(() =>
      this.embeddings.embedDocuments(texts),
    );
  }

  /**
   * Embed a single query through the circuit breaker.
   *
   * @throws {CircuitBreakerError} When the circuit is open
   * @throws The underlying error if embedding fails
   */
  async embedQuery(text: string): Promise<number[]> {
    return embeddingsCircuit.execute(() => this.embeddings.embedQuery(text));
  }

  /**
   * Embed a single query with fallback to empty array when circuit is open.
   * Useful for search queries where returning no results is acceptable.
   */
  async embedQueryWithFallback(text: string): Promise<number[]> {
    return embeddingsCircuit.executeWithFallback(
      () => this.embeddings.embedQuery(text),
      [],
    );
  }
}

/**
 * Creates a new protected embeddings instance.
 */
export function createProtectedEmbeddings(
  apiKey?: string,
): ProtectedOpenAIEmbeddings {
  return new ProtectedOpenAIEmbeddings(apiKey);
}

/**
 * Returns current metrics for the embeddings circuit breaker.
 */
export function getEmbeddingsCircuitMetrics(): CircuitBreakerMetrics {
  return embeddingsCircuit.getMetrics();
}

/**
 * Resets the embeddings circuit breaker to closed state.
 * Useful for testing or manual recovery.
 */
export function resetEmbeddingsCircuit(): void {
  embeddingsCircuit.reset();
}
