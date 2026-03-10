import { HumanMessage } from "@langchain/core/messages";
import {
  AgentRunner,
  makeDefaultState,
  type AgentState,
} from "@usopc/core";

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
        "DATABASE_URL is required. Run within `sst shell` to set environment variables.",
      );
    }
    sharedRunner = await AgentRunner.create({
      databaseUrl,
      openaiApiKey: process.env.OPENAI_API_KEY,
      tavilyApiKey: process.env.TAVILY_API_KEY,
    });
  }
  return sharedRunner;
}

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
  const runner = await getRunner();

  const output = await runner.invoke({
    messages: [new HumanMessage(userMessage)],
  });

  const trajectory = output.trajectory ?? [];

  return {
    state: makeDefaultState({
      messages: [new HumanMessage(userMessage)],
      answer: output.answer,
      citations: output.citations,
      escalation: output.escalation,
      disclaimer: output.disclaimer,
    }),
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
