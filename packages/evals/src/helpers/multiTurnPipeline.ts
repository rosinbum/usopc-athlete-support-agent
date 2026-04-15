import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { AgentRunner, makeDefaultState, type AgentState } from "@usopc/core";

/**
 * Converts a simple message array to LangChain BaseMessage objects.
 */
function toBaseMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): BaseMessage[] {
  return messages.map((m) =>
    m.role === "assistant"
      ? new AIMessage(m.content)
      : new HumanMessage(m.content),
  );
}

// ---------------------------------------------------------------------------
// Shared runner — lazy-initialized, reused across all eval invocations so we
// don't exhaust the pg connection pool (max 5) by creating a new runner per
// test.  The process-exit cleanup releases connections automatically.
// ---------------------------------------------------------------------------

let sharedRunner: AgentRunner | null = null;

async function getRunner(): Promise<AgentRunner> {
  if (!sharedRunner) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "runMultiTurnPipeline: DATABASE_URL is required. Set DATABASE_URL in .env.local.",
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error(
        "runMultiTurnPipeline: OPENAI_API_KEY is required. Set OPENAI_API_KEY in .env.local.",
      );
    }

    sharedRunner = await AgentRunner.create({
      databaseUrl,
      openaiApiKey,
      tavilyApiKey: process.env.TAVILY_API_KEY,
    });
  }
  return sharedRunner;
}

/**
 * Runs the full agent pipeline for a multi-turn conversation and returns
 * the final state and trajectory.
 *
 * For single-turn scenarios, use `runPipeline()` from `./pipeline.ts` instead.
 * This helper accepts an array of messages representing a conversation history
 * and invokes the agent with the full context.
 */
export async function runMultiTurnPipeline(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  opts?:
    | { userSport?: string | undefined; conversationId?: string | undefined }
    | undefined,
): Promise<{
  state: AgentState;
  trajectory: string[];
}> {
  const runner = await getRunner();
  const baseMessages = toBaseMessages(messages);

  const output = await runner.invoke({
    messages: baseMessages,
    userSport: opts?.userSport,
    conversationId: opts?.conversationId,
  });

  const trajectory = output.trajectory ?? [];

  return {
    state: makeDefaultState({
      messages: baseMessages,
      answer: output.answer,
      citations: output.citations,
      escalation: output.escalation,
      disclaimer: output.disclaimer,
      conversationId: opts?.conversationId,
      userSport: opts?.userSport,
    }),
    trajectory,
  };
}
