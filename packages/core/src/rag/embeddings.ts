import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
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

/**
 * Creates Google Generative AI embeddings (text-embedding-004).
 *
 * Note: Switching embedding providers requires re-embedding the entire
 * corpus since different providers produce incompatible vector spaces.
 * Use for new deployments or after a full re-ingestion.
 */
export function createGoogleEmbeddings(
  apiKey?: string,
): GoogleGenerativeAIEmbeddings {
  const key = apiKey ?? process.env.GOOGLE_API_KEY;
  return new GoogleGenerativeAIEmbeddings({
    ...(key !== undefined && { apiKey: key }),
    model: "text-embedding-004",
  });
}

export { ProtectedOpenAIEmbeddings };
