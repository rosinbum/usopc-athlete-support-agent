import {
  getSecretValue,
  getOptionalSecretValue,
  getDatabaseUrl,
} from "@usopc/shared";

/**
 * Bridges .env.local values to the environment variables expected by
 * third-party SDKs (`@langchain/anthropic`, `@langchain/openai`, `langsmith`, etc.).
 *
 * When running locally, secrets are loaded from `.env.local`. This function
 * reads env vars via the shared `getSecretValue` helper and sets `process.env`
 * so that SDKs that read env vars directly (e.g. `ChatAnthropic`) work correctly.
 *
 * Call this once at the top of every CLI entry point that loads `.env.local`.
 */
export function resolveEnv(): void {
  // DATABASE_URL — needed by the pipeline helper for vector store
  if (!process.env.DATABASE_URL) {
    try {
      process.env.DATABASE_URL = getDatabaseUrl();
    } catch {
      // Will fail later with a clear error if actually needed
    }
  }

  // ANTHROPIC_API_KEY — used by ChatAnthropic in classifier/synthesizer
  if (!process.env.ANTHROPIC_API_KEY) {
    try {
      process.env.ANTHROPIC_API_KEY = getSecretValue("ANTHROPIC_API_KEY");
    } catch {
      // Will fail later if a suite that needs it is run
    }
  }

  // OPENAI_API_KEY — used by embeddings
  if (!process.env.OPENAI_API_KEY) {
    try {
      process.env.OPENAI_API_KEY = getSecretValue("OPENAI_API_KEY");
    } catch {
      // Will fail later if a suite that needs it is run
    }
  }

  // GOOGLE_API_KEY — used by ChatGoogleGenerativeAI when provider is "google"
  if (!process.env.GOOGLE_API_KEY) {
    try {
      process.env.GOOGLE_API_KEY = getOptionalSecretValue("GOOGLE_API_KEY", "");
    } catch {
      // Optional — not required unless Google provider is configured
    }
  }

  // TAVILY_API_KEY — optional, used by web search fallback
  if (!process.env.TAVILY_API_KEY) {
    try {
      process.env.TAVILY_API_KEY = getOptionalSecretValue("TAVILY_API_KEY", "");
    } catch {
      // Optional — not required
    }
  }

  // VOYAGEAI_API_KEY — used by Voyage AI embeddings (benchmark)
  if (!process.env.VOYAGEAI_API_KEY) {
    try {
      process.env.VOYAGEAI_API_KEY = getOptionalSecretValue(
        "VOYAGEAI_API_KEY",
        "",
      );
    } catch {
      // Optional — only needed for embedding benchmark
    }
  }

  // LANGCHAIN_API_KEY — used by LangSmith client
  if (!process.env.LANGCHAIN_API_KEY) {
    try {
      process.env.LANGCHAIN_API_KEY = getSecretValue("LANGCHAIN_API_KEY");
    } catch {
      // Will fail later if LangSmith operations are attempted
    }
  }
}
