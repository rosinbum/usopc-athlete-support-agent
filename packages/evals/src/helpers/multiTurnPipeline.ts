import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { AgentRunner, nodeMetrics, type AgentState } from "@usopc/core";

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
  opts?: { userSport?: string; conversationId?: string },
): Promise<{
  state: AgentState;
  trajectory: string[];
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Run within `sst shell` to set environment variables.",
    );
  }

  nodeMetrics.reset();

  const runner = await AgentRunner.create({
    databaseUrl,
    openaiApiKey: process.env.OPENAI_API_KEY,
    tavilyApiKey: process.env.TAVILY_API_KEY,
  });

  const baseMessages = toBaseMessages(messages);

  const output = await runner.invoke({
    messages: baseMessages,
    userSport: opts?.userSport,
    conversationId: opts?.conversationId,
  });

  const trajectory = nodeMetrics.getAll().map((entry) => entry.name);

  return {
    state: {
      messages: baseMessages,
      answer: output.answer,
      citations: output.citations,
      escalation: output.escalation,
      topicDomain: undefined,
      detectedNgbIds: [],
      queryIntent: undefined,
      retrievedDocuments: [],
      webSearchResults: [],
      retrievalConfidence: 0,
      disclaimerRequired: true,
      hasTimeConstraint: false,
      conversationId: opts?.conversationId,
      userSport: opts?.userSport,
      needsClarification: false,
      clarificationQuestion: undefined,
      retrievalStatus: "success",
    },
    trajectory,
  };
}
