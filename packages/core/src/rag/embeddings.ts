import { OpenAIEmbeddings } from "@langchain/openai";
import {
  ProtectedOpenAIEmbeddings,
  createProtectedEmbeddings,
} from "../services/embeddingsService.js";

/**
 * Creates circuit-protected OpenAI embeddings.
 *
 * All embedding operations are routed through a circuit breaker
 * that protects against cascading failures from the OpenAI API.
 */
export function createEmbeddings(apiKey?: string): ProtectedOpenAIEmbeddings {
  return createProtectedEmbeddings(apiKey);
}

/**
 * Creates raw OpenAI embeddings without circuit protection.
 *
 * Use this only when circuit protection is not desired (e.g., in tests
 * or one-off scripts where you want direct error propagation).
 */
export function createRawEmbeddings(apiKey?: string): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    openAIApiKey: apiKey ?? process.env.OPENAI_API_KEY,
    modelName: "text-embedding-3-small",
    dimensions: 1536,
  });
}

export { ProtectedOpenAIEmbeddings };
