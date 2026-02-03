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
  const { messages, userSport } = await req.json();
  const runner = await getRunner();

  // Dynamic import to ensure env vars are set first
  const { AgentRunner, agentStreamToEvents } = await import("@usopc/core");

  const stateStream = runner.stream({
    messages: AgentRunner.convertMessages(messages),
    userSport,
  });

  const events = agentStreamToEvents(stateStream);

  return createDataStreamResponse({
    async execute(writer) {
      for await (const event of events) {
        if (event.type === "text-delta" && event.textDelta) {
          writer.write(formatDataStreamPart("text", event.textDelta));
        }
      }
    },
    onError: (error) => {
      console.error("Chat stream error:", error);
      return error instanceof Error ? error.message : "An error occurred";
    },
  });
}
