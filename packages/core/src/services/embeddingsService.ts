import { OpenAIEmbeddings } from "@langchain/openai";
import {
  CircuitBreaker,
  isQuotaError,
  logger,
  type CircuitBreakerMetrics,
} from "@usopc/shared";
import { MODEL_CONFIG } from "../config/index.js";
import { alertIfQuotaError, notifyOnCircuitOpen } from "./alerts.js";

const log = logger.child({ service: "embeddings-circuit" });

/**
 * Circuit breaker for OpenAI embeddings API calls.
 *
 * Configuration:
 * - failureThreshold: 3 (opens after 3 consecutive failures)
 * - resetTimeout: 60s (longer because embeddings are critical for RAG)
 * - requestTimeout: 30s (batch embeddings can be slow)
 * - shouldRecordFailure: ignores quota errors — retrying won't help, and we
 *   route those through `alertIfQuotaError` for proactive notification instead
 *   of tripping the breaker.
 */
const embeddingsCircuit = new CircuitBreaker({
  name: "openai-embeddings",
  failureThreshold: 3,
  resetTimeout: 60_000,
  requestTimeout: 30_000,
  successThreshold: 2,
  logger: log,
  shouldRecordFailure: (error) => !isQuotaError(error),
  onOpen: notifyOnCircuitOpen("openai-embeddings"),
});

/**
 * Circuit-protected OpenAI embeddings wrapper.
 *
 * Provides the same interface as OpenAIEmbeddings but routes
 * all calls through a circuit breaker.
 */
export class ProtectedOpenAIEmbeddings {
  private readonly embeddings: OpenAIEmbeddings;

  constructor(
    apiKey?: string,
    embeddingsConfig?: { model: string; dimensions: number },
  ) {
    const config = embeddingsConfig ?? MODEL_CONFIG.embeddings;
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey ?? process.env.OPENAI_API_KEY,
      modelName: config.model,
      dimensions: config.dimensions,
    });
  }

  /**
   * Embed multiple documents through the circuit breaker.
   *
   * @throws {CircuitBreakerError} When the circuit is open
   * @throws The underlying error if embedding fails
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    try {
      return await embeddingsCircuit.execute(() =>
        this.embeddings.embedDocuments(texts),
      );
    } catch (error) {
      alertIfQuotaError("openai-embeddings", error);
      throw error;
    }
  }

  /**
   * Embed a single query through the circuit breaker.
   *
   * @throws {CircuitBreakerError} When the circuit is open
   * @throws The underlying error if embedding fails
   */
  async embedQuery(text: string): Promise<number[]> {
    try {
      return await embeddingsCircuit.execute(() =>
        this.embeddings.embedQuery(text),
      );
    } catch (error) {
      alertIfQuotaError("openai-embeddings", error);
      throw error;
    }
  }

  /**
   * Embed a single query with fallback to empty array when circuit is open.
   * Useful for search queries where returning no results is acceptable.
   */
  async embedQueryWithFallback(text: string): Promise<number[]> {
    return embeddingsCircuit.executeWithFallback(
      () =>
        this.embeddings.embedQuery(text).catch((error: unknown) => {
          alertIfQuotaError("openai-embeddings", error);
          throw error;
        }),
      [],
    );
  }
}

/**
 * Creates a new protected embeddings instance.
 */
export function createProtectedEmbeddings(
  apiKey?: string,
  embeddingsConfig?: { model: string; dimensions: number },
): ProtectedOpenAIEmbeddings {
  return new ProtectedOpenAIEmbeddings(apiKey, embeddingsConfig);
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
