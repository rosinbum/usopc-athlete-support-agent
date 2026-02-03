import { getSecretValue, getOptionalEnv } from "@usopc/shared";

export async function register() {
  // Set env vars before any LangChain modules load
  // This runs once at startup, before request handlers

  // Anthropic API key for @langchain/anthropic
  try {
    process.env.ANTHROPIC_API_KEY = getSecretValue(
      "ANTHROPIC_API_KEY",
      "AnthropicApiKey",
    );
  } catch (e) {
    console.warn("ANTHROPIC_API_KEY not configured:", e);
  }

  // LangSmith tracing (optional)
  const langchainApiKey =
    getOptionalEnv("LANGCHAIN_API_KEY") ??
    (() => {
      try {
        return getSecretValue("LANGCHAIN_API_KEY", "LangchainApiKey");
      } catch {
        return undefined;
      }
    })();

  if (langchainApiKey) {
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGCHAIN_API_KEY = langchainApiKey;
    process.env.LANGCHAIN_PROJECT =
      getOptionalEnv("LANGCHAIN_PROJECT") ?? "usopc-athlete-support";
    console.log(
      "LangSmith tracing enabled for project:",
      process.env.LANGCHAIN_PROJECT,
    );
  }
}
