import { AgentRunner, agentStreamToEvents } from "@usopc/core";
import { getDatabaseUrl, getSecretValue, getOptionalEnv } from "@usopc/shared";
import { createDataStreamResponse, formatDataStreamPart } from "ai";

// Configure LangSmith tracing (optional - enable if LANGCHAIN_API_KEY is set)
function configureLangSmith() {
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
    console.log("LangSmith tracing enabled");
  }
}

// Cache a single runner instance per Lambda cold start
let runnerPromise: Promise<AgentRunner> | null = null;

function getRunner(): Promise<AgentRunner> {
  if (!runnerPromise) {
    // Set env vars for SDKs that read from process.env
    process.env.ANTHROPIC_API_KEY = getSecretValue(
      "ANTHROPIC_API_KEY",
      "AnthropicApiKey",
    );

    // Configure LangSmith tracing if API key is available
    configureLangSmith();

    runnerPromise = AgentRunner.create({
      databaseUrl: getDatabaseUrl(),
      openaiApiKey: getSecretValue("OPENAI_API_KEY", "OpenaiApiKey"),
      tavilyApiKey: getSecretValue("TAVILY_API_KEY", "TavilyApiKey"),
    });
  }
  return runnerPromise;
}

export async function POST(req: Request) {
  const { messages, userSport } = await req.json();
  const runner = await getRunner();

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
