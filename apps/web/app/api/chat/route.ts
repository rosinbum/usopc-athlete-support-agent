import { AgentRunner, agentStreamToEvents } from "@usopc/core";
import { getDatabaseUrl, getSecretValue } from "@usopc/shared";
import { createDataStreamResponse, formatDataStreamPart } from "ai";

// Cache a single runner instance per Lambda cold start
let runnerPromise: Promise<AgentRunner> | null = null;

function getRunner(): Promise<AgentRunner> {
  if (!runnerPromise) {
    // Set env vars for SDKs that read from process.env (e.g., @langchain/anthropic)
    process.env.ANTHROPIC_API_KEY = getSecretValue(
      "ANTHROPIC_API_KEY",
      "AnthropicApiKey",
    );

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
