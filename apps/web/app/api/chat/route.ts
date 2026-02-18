import {
  createDataStreamResponse,
  formatDataStreamPart,
  type JSONValue,
} from "ai";
import { Resource } from "sst";
import { logger } from "@usopc/shared";

const log = logger.child({ service: "chat-route" });

const discoveryFeedQueueUrl = (
  Resource as unknown as { DiscoveryFeedQueue: { url: string } }
).DiscoveryFeedQueue.url;

// Cache a single runner instance per Lambda cold start
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runnerPromise: Promise<any> | null = null;

async function initRunner() {
  // Import shared utils first to set env vars
  const { getDatabaseUrl, getSecretValue, getOptionalEnv } =
    await import("@usopc/shared");

  // Read the Anthropic key into a local variable — it will be passed
  // explicitly to AgentRunner.create() instead of lingering in process.env.
  const anthropicApiKey = getSecretValue(
    "ANTHROPIC_API_KEY",
    "AnthropicApiKey",
  );

  // LangSmith tracing (optional)
  let langchainApiKey: string | undefined;
  try {
    langchainApiKey = getSecretValue("LANGCHAIN_API_KEY", "LangchainApiKey");
    log.info("Found LangSmith API key from SST secret");
  } catch (e) {
    log.info("LangSmith API key not found in SST secrets", {
      error: String(e),
    });
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

  // Now import the agent (which loads LangChain with env vars set)
  const { AgentRunner } = await import("@usopc/core");

  const runner = await AgentRunner.create({
    databaseUrl: getDatabaseUrl(),
    openaiApiKey: getSecretValue("OPENAI_API_KEY", "OpenaiApiKey"),
    tavilyApiKey: getSecretValue("TAVILY_API_KEY", "TavilyApiKey"),
    anthropicApiKey,
  });

  // Remove the Anthropic key from the environment now that it's stored
  // in module-scoped state. LANGCHAIN_API_KEY must stay — the LangSmith
  // SDK reads it from process.env on every trace flush.
  delete process.env.ANTHROPIC_API_KEY;

  return runner;
}

async function getRunner() {
  if (!runnerPromise) {
    runnerPromise = initRunner().catch((err) => {
      // Clear the cache so the next request retries instead of
      // permanently returning a rejected promise.
      runnerPromise = null;
      throw err;
    });
  }
  return runnerPromise;
}

export async function POST(req: Request) {
  try {
    log.info("POST /api/chat called");
    const { messages, userSport, conversationId } = await req.json();
    const runner = await getRunner();
    log.info("Runner initialized", {
      tracingEnabled: process.env.LANGCHAIN_TRACING_V2,
    });

    // Dynamic import to ensure env vars are set first
    const {
      AgentRunner,
      agentStreamToEvents,
      getFeatureFlags,
      loadSummary,
      saveSummary,
      generateSummary,
      publishDiscoveredUrls,
    } = await import("@usopc/core");

    // Load existing conversation summary if feature is enabled
    const flags = getFeatureFlags();
    let conversationSummary: string | undefined;
    if (flags.conversationMemory && conversationId) {
      conversationSummary = await loadSummary(conversationId);
    }

    const langchainMessages = AgentRunner.convertMessages(messages);
    const stateStream = runner.stream({
      messages: langchainMessages,
      userSport,
      conversationId,
      conversationSummary,
    });

    const events = agentStreamToEvents(stateStream);

    return createDataStreamResponse({
      async execute(writer) {
        let discoveredUrls: {
          url: string;
          title: string;
          content: string;
          score: number;
        }[] = [];

        for await (const event of events) {
          if (event.type === "answer-reset") {
            writer.write(
              formatDataStreamPart("data", [{ type: "answer-reset" }]),
            );
          } else if (event.type === "text-delta" && event.textDelta) {
            writer.write(formatDataStreamPart("text", event.textDelta));
          } else if (event.type === "error" && event.error) {
            log.error("Agent stream error", { error: String(event.error) });
            writer.write(formatDataStreamPart("error", event.error.message));
          } else if (event.type === "citations" && event.citations) {
            writer.write(
              formatDataStreamPart("message_annotations", [
                { type: "citations", citations: event.citations },
              ] as unknown as JSONValue[]),
            );
          } else if (event.type === "discovered-urls" && event.discoveredUrls) {
            // Captured server-side only for fire-and-forget persistence.
            // Not forwarded to the client — no UX signal for discovery.
            discoveredUrls = event.discoveredUrls;
          }
        }

        // Fire-and-forget: generate and save updated summary after stream completes
        if (flags.conversationMemory && conversationId) {
          generateSummary(langchainMessages, conversationSummary)
            .then((summary: string) => saveSummary(conversationId, summary))
            .catch((err: unknown) =>
              log.error("Failed to save conversation summary", {
                error: String(err),
              }),
            );
        }

        // Fire-and-forget: publish discovered URLs to SQS for async evaluation
        if (discoveredUrls.length > 0) {
          publishDiscoveredUrls(discoveredUrls, discoveryFeedQueueUrl).catch(
            (err: unknown) =>
              log.error("Failed to publish discovered URLs", {
                error: String(err),
              }),
          );
        }
      },
      onError: (error) => {
        log.error("Chat stream error", { error: String(error) });
        return error instanceof Error ? error.message : "An error occurred";
      },
    });
  } catch (error) {
    log.error("Chat request failed", { error: String(error) });
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
