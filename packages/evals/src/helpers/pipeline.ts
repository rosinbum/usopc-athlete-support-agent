import { HumanMessage } from "@langchain/core/messages";
import { AgentRunner, nodeMetrics, type AgentState } from "@usopc/core";

/**
 * Runs the full agent pipeline for a user message and returns the final state.
 *
 * Requires environment variables:
 * - DATABASE_URL (for vector store)
 * - OPENAI_API_KEY (for embeddings)
 * - ANTHROPIC_API_KEY (for classifier/synthesizer)
 * - TAVILY_API_KEY (optional, for web search fallback)
 *
 * Callers should run this within `sst shell` to get these env vars.
 */
export async function runPipeline(userMessage: string): Promise<{
  state: AgentState;
  trajectory: string[];
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Run within `sst shell` to set environment variables.",
    );
  }

  // Reset metrics to capture only this run's trajectory
  nodeMetrics.reset();

  const runner = await AgentRunner.create({
    databaseUrl,
    openaiApiKey: process.env.OPENAI_API_KEY,
    tavilyApiKey: process.env.TAVILY_API_KEY,
  });

  const output = await runner.invoke({
    messages: [new HumanMessage(userMessage)],
  });

  // Extract trajectory from the metrics collector
  const trajectory = nodeMetrics.getAll().map((entry) => entry.name);

  return {
    state: {
      messages: [new HumanMessage(userMessage)],
      answer: output.answer,
      citations: output.citations,
      escalation: output.escalation,
      // These fields aren't directly available from AgentOutput,
      // so we set sensible defaults. Full state is available through
      // the graph's stream mode if needed.
      topicDomain: undefined,
      detectedNgbIds: [],
      queryIntent: undefined,
      retrievedDocuments: [],
      webSearchResults: [],
      retrievalConfidence: 0,
      disclaimerRequired: true,
      hasTimeConstraint: false,
      conversationId: undefined,
      userSport: undefined,
      needsClarification: false,
      clarificationQuestion: undefined,
      escalationReason: undefined,
      retrievalStatus: "success",
      emotionalState: "neutral",
      qualityCheckResult: undefined,
      qualityRetryCount: 0,
      expansionAttempted: false,
      reformulatedQueries: [],
    },
    trajectory,
  };
}

/**
 * Runs the full agent pipeline and returns the answer, citations, and
 * trajectory needed for groundedness/correctness evaluation.
 */
export async function runPipelineForAnswerEval(userMessage: string): Promise<{
  answer: string;
  context: string;
  trajectory: string[];
}> {
  const result = await runPipeline(userMessage);
  const citations = result.state.citations ?? [];
  const context = citations
    .map((c) => `[${c.title}] ${c.snippet}`)
    .join("\n\n");
  return {
    answer: result.state.answer ?? "",
    context,
    trajectory: result.trajectory,
  };
}
