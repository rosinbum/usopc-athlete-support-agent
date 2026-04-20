import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createEmbeddings } from "../rag/embeddings.js";
import type { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { createVectorStore } from "../rag/vectorStore.js";
import { getPool } from "@usopc/shared";
import { createTavilySearchTool } from "./nodes/researcher.js";
import type { TavilySearchLike } from "./nodes/researcher.js";
import { logger } from "@usopc/shared";
import { createAgentGraph } from "./graph.js";
import { createPostgresCheckpointer } from "./checkpointer.js";
import { GRAPH_CONFIG, createAgentModels } from "../config/index.js";
import { withTimeout, TimeoutError } from "../utils/withTimeout.js";
import { NodeMetricsCollector } from "./nodeMetrics.js";

import type { Citation, EscalationInfo } from "../types/index.js";
import type { AgentState } from "./state.js";

const log = logger.child({ service: "agent-runner" });

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
  openaiApiKey?: string | undefined;
  tavilyApiKey?: string | undefined;
}

export interface AgentInput {
  messages: BaseMessage[];
  userSport?: string | undefined;
  conversationId?: string | undefined;
  /** User identity for future per-user features. */
  userId?: string | undefined;
}

export interface AgentOutput {
  answer: string;
  citations: Citation[];
  escalation?: EscalationInfo | undefined;
  disclaimer?: string | undefined;
  trajectory?: string[] | undefined;
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
 * `stream()` methods. Shared entry point for web and Slack.
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
   *
   * Model instances (`agentModel` for Sonnet, `classifierModel` for Haiku) are
   * constructed once here and injected into every graph node via factory closures.
   * In a Lambda warm container these instances persist across sequential requests,
   * avoiding 3-5 redundant model allocations per invocation.
   *
   * Config changes (model name, temperature, maxTokens) take effect only on
   * cold start, when a new `AgentRunner` is created.
   */
  static async create(config: AgentRunnerConfig): Promise<AgentRunner> {
    if (!config.databaseUrl) {
      throw new Error("databaseUrl is required");
    }

    const embeddings = createEmbeddings(config.openaiApiKey);

    const vectorStore = await createVectorStore(embeddings);

    const tavilySearch: TavilySearchLike = config.tavilyApiKey
      ? (createTavilySearchTool(config.tavilyApiKey) as TavilySearchLike)
      : { invoke: async () => "" };

    // Construct shared model instances once for all graph nodes
    const { agentModel, classifierModel } = await createAgentModels();

    log.info("Agent models constructed");

    // Create checkpointer using the shared pool (PERF-3: avoids a second
    // unmanaged pool that would double connection usage per Lambda container)
    const checkpointer = await createPostgresCheckpointer(getPool());
    log.info("Postgres checkpointer initialized");

    const graph = createAgentGraph(
      {
        vectorStore,
        tavilySearch,
        pool: getPool(),
        agentModel,
        classifierModel,
      },
      { checkpointer },
    );

    return new AgentRunner(graph, vectorStore);
  }

  /**
   * Close the underlying vector store connection.
   * The checkpointer shares the singleton pool (managed by closePool() in
   * @usopc/shared), so we intentionally skip checkpointer.end() — calling
   * it would destroy the shared pool for all consumers.
   */
  async close(): Promise<void> {
    await this.vectorStore.end();
  }

  /**
   * Run the full graph and return the final structured output.
   * Enforces a timeout to prevent indefinitely hung invocations.
   */
  async invoke(input: AgentInput): Promise<AgentOutput> {
    const metrics = new NodeMetricsCollector();
    const initialState = this.buildInitialState(input);
    const threadId =
      (initialState.conversationId as string | undefined) ??
      crypto.randomUUID();
    const config = {
      recursionLimit: GRAPH_CONFIG.recursionLimit,
      configurable: { thread_id: threadId, nodeMetrics: metrics },
      ...(initialState.conversationId
        ? { metadata: { session_id: initialState.conversationId } }
        : {}),
    };
    const finalState = await withTimeout(
      this.graph.invoke(initialState, config),
      GRAPH_CONFIG.invokeTimeoutMs,
      "graph.invoke",
    );

    return {
      answer: finalState.answer ?? "",
      citations: finalState.citations ?? [],
      escalation: finalState.escalation,
      disclaimer: finalState.disclaimer,
      trajectory: metrics.getAll().map((entry) => entry.name),
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

    const threadId =
      (initialState.conversationId as string | undefined) ??
      crypto.randomUUID();

    // Dual stream mode: "values" for state after each node, "messages" for token streaming
    const stream = await this.graph.stream(initialState, {
      streamMode: ["values", "messages"],
      recursionLimit: GRAPH_CONFIG.recursionLimit,
      configurable: {
        thread_id: threadId,
        nodeMetrics: new NodeMetricsCollector(),
      },
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

  /**
   * Validates a conversationId for safe use in LangSmith metadata.
   * Accepts UUIDs, alphanumeric strings with hyphens/underscores, and dots
   * (needed for Slack timestamps like "1234567890.123456").
   */
  private static isValidConversationId(id: string): boolean {
    return /^[a-zA-Z0-9._-]{1,128}$/.test(id);
  }

  private buildInitialState(input: AgentInput): Record<string, unknown> {
    let conversationId = input.conversationId;
    if (conversationId && !AgentRunner.isValidConversationId(conversationId)) {
      log.warn("Invalid conversationId format; ignoring", {
        conversationId: conversationId.slice(0, 50),
      });
      conversationId = undefined;
    }
    // Output/derived fields use replace reducers, so the Postgres checkpointer
    // would otherwise hand the next turn the prior turn's answer, citations,
    // etc. Reset them explicitly so each turn starts with clean channels.
    // `messages` accumulates correctly via the add-messages reducer.
    return {
      messages: input.messages,
      userSport: input.userSport,
      conversationId,
      answer: undefined,
      citations: [],
      disclaimer: undefined,
      escalation: undefined,
      escalationReason: undefined,
      qualityCheckResult: undefined,
      qualityRetryCount: 0,
      needsClarification: false,
      clarificationQuestion: undefined,
      retrievedDocuments: [],
      webSearchResults: [],
      webSearchResultUrls: [],
      retrievalConfidence: 0,
      retrievalStatus: "success",
      topicDomain: undefined,
      queryIntent: undefined,
      detectedNgbIds: [],
      emotionalState: "neutral",
      emotionalSupportContext: undefined,
      hasTimeConstraint: false,
      expansionAttempted: false,
      reformulatedQueries: [],
      isComplexQuery: false,
      subQueries: [],
    };
  }
}
