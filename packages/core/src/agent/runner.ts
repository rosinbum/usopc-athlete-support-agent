import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createEmbeddings } from "../rag/embeddings.js";
import type { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { createVectorStore } from "../rag/vectorStore.js";
import { createTavilySearchTool } from "./nodes/researcher.js";
import type { TavilySearchLike } from "./nodes/researcher.js";
import { createAgentGraph } from "./graph.js";
import { GRAPH_CONFIG, setAnthropicApiKey } from "../config/index.js";
import { withTimeout, TimeoutError } from "../utils/withTimeout.js";
import type { Citation, EscalationInfo } from "../types/index.js";
import type { AgentState } from "./state.js";

/**
 * Stream chunk types from dual-mode streaming.
 * - "values" mode yields full state after each node
 * - "messages" mode yields [AIMessageChunk, metadata] tuples for token streaming
 */
export type StreamChunk =
  | ["values", Partial<AgentState>]
  | [
      "messages",
      [
        { content: string | Array<{ type: string; text?: string }> },
        { langgraph_node?: string },
      ],
    ];

export interface AgentRunnerConfig {
  databaseUrl: string;
  openaiApiKey?: string;
  tavilyApiKey?: string;
  anthropicApiKey?: string;
}

export interface AgentInput {
  messages: BaseMessage[];
  userSport?: string;
  conversationId?: string;
  conversationSummary?: string;
}

export interface AgentOutput {
  answer: string;
  citations: Citation[];
  escalation?: EscalationInfo;
}

/**
 * Converts plain `{role, content}` message pairs into LangChain BaseMessage objects.
 */
export function convertMessages(
  messages: Array<{ role: string; content: string }>,
): BaseMessage[] {
  return messages.map((msg) => {
    if (msg.role === "assistant") {
      return new AIMessage(msg.content);
    }
    return new HumanMessage(msg.content);
  });
}

/**
 * High-level wrapper around the LangGraph agent.
 *
 * Encapsulates graph instantiation and provides clean `invoke()` and
 * `stream()` methods. Shared entry point for web, tRPC, and Slack.
 */
export class AgentRunner {
  private graph: ReturnType<typeof createAgentGraph>;
  private vectorStore: PGVectorStore;

  private constructor(
    graph: ReturnType<typeof createAgentGraph>,
    vectorStore: PGVectorStore,
  ) {
    this.graph = graph;
    this.vectorStore = vectorStore;
  }

  /**
   * Factory — creates embeddings, vector store, optional Tavily search,
   * and compiles the LangGraph agent.
   */
  static async create(config: AgentRunnerConfig): Promise<AgentRunner> {
    if (!config.databaseUrl) {
      throw new Error("databaseUrl is required");
    }

    if (config.anthropicApiKey) {
      setAnthropicApiKey(config.anthropicApiKey);
    }

    const embeddings = createEmbeddings(config.openaiApiKey);

    const vectorStore = await createVectorStore(embeddings);

    const tavilySearch: TavilySearchLike = config.tavilyApiKey
      ? (createTavilySearchTool(config.tavilyApiKey) as TavilySearchLike)
      : { invoke: async () => "" };

    const graph = createAgentGraph({ vectorStore, tavilySearch });

    return new AgentRunner(graph, vectorStore);
  }

  /**
   * Close the underlying vector store connection pool.
   * Call this when the runner is no longer needed to prevent connection leaks.
   */
  async close(): Promise<void> {
    await this.vectorStore.end();
  }

  /**
   * Run the full graph and return the final structured output.
   * Enforces a timeout to prevent indefinitely hung invocations.
   */
  async invoke(input: AgentInput): Promise<AgentOutput> {
    const initialState = this.buildInitialState(input);
    const config = initialState.conversationId
      ? { metadata: { session_id: initialState.conversationId } }
      : undefined;
    const finalState = await withTimeout(
      this.graph.invoke(initialState, config),
      GRAPH_CONFIG.invokeTimeoutMs,
      "graph.invoke",
    );

    return {
      answer: finalState.answer ?? "",
      citations: finalState.citations ?? [],
      escalation: finalState.escalation,
    };
  }

  /**
   * Stream chunk types from dual-mode streaming.
   * - "values" mode yields full state after each node
   * - "messages" mode yields [AIMessageChunk, metadata] tuples for token streaming
   */
  static StreamChunkTypes = {
    VALUES: "values" as const,
    MESSAGES: "messages" as const,
  };

  /**
   * Stream graph execution with token-level streaming.
   * Uses dual stream mode to get both state updates and token-by-token LLM output.
   * Enforces a deadline to prevent indefinitely hung streams.
   */
  async *stream(input: AgentInput): AsyncGenerator<StreamChunk> {
    const initialState = this.buildInitialState(input);
    const deadline = Date.now() + GRAPH_CONFIG.streamTimeoutMs;

    // Dual stream mode: "values" for state after each node, "messages" for token streaming
    const stream = await this.graph.stream(initialState, {
      streamMode: ["values", "messages"],
      ...(initialState.conversationId
        ? { metadata: { session_id: initialState.conversationId } }
        : {}),
    });

    for await (const chunk of stream) {
      if (Date.now() > deadline) {
        throw new TimeoutError("graph.stream", GRAPH_CONFIG.streamTimeoutMs);
      }
      // LangGraph emits [mode, data] tuples when using array streamMode
      yield chunk as StreamChunk;
    }
  }

  /**
   * Convenience re-export for use from route handlers.
   */
  static convertMessages = convertMessages;

  private buildInitialState(input: AgentInput): Record<string, unknown> {
    return {
      messages: input.messages,
      userSport: input.userSport,
      conversationId: input.conversationId,
      conversationSummary: input.conversationSummary,
    };
  }
}
