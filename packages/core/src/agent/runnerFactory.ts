import { logger } from "@usopc/shared";
import type { AgentRunner } from "./runner.js";

const log = logger.child({ service: "runner-factory" });

let runnerPromise: Promise<AgentRunner> | null = null;

/**
 * Returns a cached {@link AgentRunner} singleton, initializing on first call.
 *
 * Handles:
 * 1. Secret resolution via `@usopc/shared` (`getSecretValue`, `getDatabaseUrl`)
 * 2. `ANTHROPIC_API_KEY` env var setup (required before LangChain import)
 * 3. LangSmith tracing configuration (optional)
 * 4. `DynamoSummaryStore` wiring via `setSummaryStore()`
 * 5. `AgentRunner.create()` with all API keys
 *
 * On initialization failure the cached promise is cleared so the next call
 * retries instead of permanently returning a rejected promise.
 */
export function getAppRunner(): Promise<AgentRunner> {
  if (!runnerPromise) {
    runnerPromise = initRunner().catch((err) => {
      runnerPromise = null;
      throw err;
    });
  }
  return runnerPromise;
}

/**
 * Clears the cached runner (for testing or forced re-initialization).
 */
export function resetAppRunner(): void {
  runnerPromise = null;
}

async function initRunner(): Promise<AgentRunner> {
  // Dynamic imports so env vars are set BEFORE LangChain modules load
  const {
    getDatabaseUrl,
    getSecretValue,
    getOptionalEnv,
    createConversationSummaryEntity,
  } = await import("@usopc/shared");

  // Set env vars BEFORE importing @usopc/core modules (which load LangChain)
  process.env.ANTHROPIC_API_KEY = getSecretValue(
    "ANTHROPIC_API_KEY",
    "AnthropicApiKey",
  );

  // LangSmith tracing (optional)
  let langchainApiKey: string | undefined;
  try {
    langchainApiKey = getSecretValue("LANGCHAIN_API_KEY", "LangchainApiKey");
    log.info("Found LangSmith API key from SST secret");
  } catch {
    langchainApiKey = getOptionalEnv("LANGCHAIN_API_KEY");
    if (langchainApiKey) {
      log.info("Found LangSmith API key from env var");
    }
  }

  if (langchainApiKey) {
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGCHAIN_API_KEY = langchainApiKey;
    process.env.LANGCHAIN_PROJECT =
      getOptionalEnv("LANGCHAIN_PROJECT") ?? "usopc-athlete-support";
    log.info("LangSmith tracing ENABLED", {
      project: process.env.LANGCHAIN_PROJECT,
    });
  } else {
    log.info("LangSmith tracing DISABLED - no API key found");
  }

  // Now import agent modules (LangChain env vars are set)
  const { AgentRunner } = await import("./runner.js");
  const { setSummaryStore } = await import("../services/conversationMemory.js");
  const { DynamoSummaryStore } =
    await import("../services/dynamoSummaryStore.js");

  // Replace in-memory store with DynamoDB-backed store
  const summaryEntity = createConversationSummaryEntity();
  setSummaryStore(new DynamoSummaryStore(summaryEntity));

  return await AgentRunner.create({
    databaseUrl: getDatabaseUrl(),
    openaiApiKey: getSecretValue("OPENAI_API_KEY", "OpenaiApiKey"),
    tavilyApiKey: getSecretValue("TAVILY_API_KEY", "TavilyApiKey"),
  });
}
