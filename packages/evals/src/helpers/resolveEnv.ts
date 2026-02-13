import {
  getSecretValue,
  getOptionalSecretValue,
  getDatabaseUrl,
} from "@usopc/shared";

/**
 * Bridges SST Resource bindings to the environment variables expected by
 * third-party SDKs (`@langchain/anthropic`, `@langchain/openai`, `langsmith`, etc.).
 *
 * Under `sst shell`, secrets are available as `Resource.AnthropicApiKey.value`
 * but NOT as `ANTHROPIC_API_KEY`. This function reads from SST Resources via
 * the shared `getSecretValue` helper and sets `process.env` so that SDKs that
 * read env vars directly (e.g. `ChatAnthropic`) work correctly.
 *
 * Call this once at the top of every CLI entry point that runs under `sst shell`.
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
      process.env.ANTHROPIC_API_KEY = getSecretValue(
        "ANTHROPIC_API_KEY",
        "AnthropicApiKey",
      );
    } catch {
      // Will fail later if a suite that needs it is run
    }
  }

  // OPENAI_API_KEY — used by embeddings
  if (!process.env.OPENAI_API_KEY) {
    try {
      process.env.OPENAI_API_KEY = getSecretValue(
        "OPENAI_API_KEY",
        "OpenaiApiKey",
      );
    } catch {
      // Will fail later if a suite that needs it is run
    }
  }

  // TAVILY_API_KEY — optional, used by web search fallback
  if (!process.env.TAVILY_API_KEY) {
    try {
      process.env.TAVILY_API_KEY = getOptionalSecretValue(
        "TAVILY_API_KEY",
        "TavilyApiKey",
        "",
      );
    } catch {
      // Optional — not required
    }
  }

  // LANGCHAIN_API_KEY — used by LangSmith client
  if (!process.env.LANGCHAIN_API_KEY) {
    try {
      process.env.LANGCHAIN_API_KEY = getSecretValue(
        "LANGCHAIN_API_KEY",
        "LangchainApiKey",
      );
    } catch {
      // Will fail later if LangSmith operations are attempted
    }
  }
}
