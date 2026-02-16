import { createDataStreamResponse, formatDataStreamPart } from "ai";

// Cache a single runner instance per Lambda cold start
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runnerPromise: Promise<any> | null = null;

async function getRunner() {
  if (!runnerPromise) {
    // Import shared utils first to set env vars
    const { getDatabaseUrl, getSecretValue, getOptionalEnv } =
      await import("@usopc/shared");

    // Set env vars BEFORE importing @usopc/core (which loads LangChain)
    process.env.ANTHROPIC_API_KEY = getSecretValue(
      "ANTHROPIC_API_KEY",
      "AnthropicApiKey",
    );

    // LangSmith tracing (optional)
    let langchainApiKey: string | undefined;
    try {
      langchainApiKey = getSecretValue("LANGCHAIN_API_KEY", "LangchainApiKey");
      console.log("Found LangSmith API key from SST secret");
    } catch (e) {
      console.log("LangSmith API key not found in SST secrets:", e);
      langchainApiKey = getOptionalEnv("LANGCHAIN_API_KEY");
      if (langchainApiKey) {
        console.log("Found LangSmith API key from env var");
      }
    }

    if (langchainApiKey) {
      process.env.LANGCHAIN_TRACING_V2 = "true";
      process.env.LANGCHAIN_API_KEY = langchainApiKey;
      process.env.LANGCHAIN_PROJECT =
        getOptionalEnv("LANGCHAIN_PROJECT") ?? "usopc-athlete-support";
      console.log(
        "LangSmith tracing ENABLED for project:",
        process.env.LANGCHAIN_PROJECT,
      );
    } else {
      console.log("LangSmith tracing DISABLED - no API key found");
    }

    // Now import the agent (which loads LangChain with env vars set)
    const { AgentRunner } = await import("@usopc/core");

    runnerPromise = AgentRunner.create({
      databaseUrl: getDatabaseUrl(),
      openaiApiKey: getSecretValue("OPENAI_API_KEY", "OpenaiApiKey"),
      tavilyApiKey: getSecretValue("TAVILY_API_KEY", "TavilyApiKey"),
    });
  }
  return runnerPromise!;
}

export async function POST(req: Request) {
  console.log("POST /api/chat called");
  const { messages, userSport, conversationId } = await req.json();
  const runner = await getRunner();
  console.log(
    "Runner initialized, LANGCHAIN_TRACING_V2:",
    process.env.LANGCHAIN_TRACING_V2,
  );

  // Dynamic import to ensure env vars are set first
  const {
    AgentRunner,
    agentStreamToEvents,
    getFeatureFlags,
    loadSummary,
    saveSummary,
    generateSummary,
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
      for await (const event of events) {
        if (event.type === "answer-reset") {
          writer.write(
            formatDataStreamPart("data", [{ type: "answer-reset" }]),
          );
        } else if (event.type === "text-delta" && event.textDelta) {
          writer.write(formatDataStreamPart("text", event.textDelta));
        } else if (event.type === "error" && event.error) {
          console.error("Agent stream error:", event.error);
          writer.write(formatDataStreamPart("error", event.error.message));
        }
      }

      // Fire-and-forget: generate and save updated summary after stream completes
      if (flags.conversationMemory && conversationId) {
        generateSummary(langchainMessages, conversationSummary)
          .then((summary: string) => saveSummary(conversationId, summary))
          .catch((err: unknown) =>
            console.error("Failed to save conversation summary:", err),
          );
      }
    },
    onError: (error) => {
      console.error("Chat stream error:", error);
      return error instanceof Error ? error.message : "An error occurred";
    },
  });
}
