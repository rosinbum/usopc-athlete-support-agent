import type { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createEmbeddings } from "../rag/embeddings.js";
import type { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { createVectorStore } from "../rag/vectorStore.js";
import { createTavilySearchTool } from "./nodes/researcher.js";
import type { TavilySearchLike } from "./nodes/researcher.js";
import { logger } from "@usopc/shared";
import { createAgentGraph } from "./graph.js";
import { GRAPH_CONFIG, createAgentModels } from "../config/index.js";
import { withTimeout, TimeoutError } from "../utils/withTimeout.js";
import { nodeMetrics } from "./nodeMetrics.js";
import {
  generateSummary,
  saveSummary,
} from "../services/conversationMemory.js";
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
  conversationSummary?: string | undefined;
}

export interface AgentOutput {
  answer: string;
  citations: Citation[];
  escalation?: EscalationInfo | undefined;
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
  private _classifierModel: ChatAnthropic;

  private constructor(
    graph: ReturnType<typeof createAgentGraph>,
    vectorStore: PGVectorStore,
    classifierModel: ChatAnthropic,
  ) {
    this.graph = graph;
    this.vectorStore = vectorStore;
    this._classifierModel = classifierModel;
  }

  /**
   * The shared Haiku model instance. Exposed so callers (e.g., route handlers)
   * can pass it to `generateSummary()` without a module-level singleton.
   */
  get classifierModel(): ChatAnthropic {
    return this._classifierModel;
  }

  /**
   * Factory — creates embeddings, vector store, optional Tavily search,
   * and compiles the LangGraph agent.
   *
   * Model instances (`agentModel` for Sonnet, `classifierModel` for Haiku) are
   * constructed once here and injected into every graph node via factory closures.
   * In a Lambda warm container these instances persist across sequential requests,
   * avoiding 3-5 redundant `ChatAnthropic` allocations per invocation.
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

    const graph = createAgentGraph({
      vectorStore,
      tavilySearch,
      agentModel,
      classifierModel,
    });

    return new AgentRunner(graph, vectorStore, classifierModel);
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
    nodeMetrics.reset();
    const initialState = this.buildInitialState(input);
    const config = initialState.conversationId
      ? { metadata: { session_id: initialState.conversationId } }
      : undefined;
    const finalState = await withTimeout(
      this.graph.invoke(initialState, config),
      GRAPH_CONFIG.invokeTimeoutMs,
      "graph.invoke",
    );

    const output: AgentOutput = {
      answer: finalState.answer ?? "",
      citations: finalState.citations ?? [],
      escalation: finalState.escalation,
    };

    // Fire-and-forget: save conversation summary for multi-turn context
    if (input.conversationId && initialState.conversationId) {
      generateSummary(
        input.messages,
        input.conversationSummary,
        this._classifierModel,
      )
        .then((s) => saveSummary(input.conversationId!, s))
        .catch((e) =>
          log.error("Failed to save conversation summary", {
            error: String(e),
          }),
        );
    }

    return output;
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
    nodeMetrics.reset();
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

    // Runs after consumer finishes iterating the generator
    if (input.conversationId && initialState.conversationId) {
      generateSummary(
        input.messages,
        input.conversationSummary,
        this._classifierModel,
      )
        .then((s) => saveSummary(input.conversationId!, s))
        .catch((e) =>
          log.error("Failed to save conversation summary", {
            error: String(e),
          }),
        );
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
    return {
      messages: input.messages,
      userSport: input.userSport,
      conversationId,
      conversationSummary: input.conversationSummary,
    };
  }
}
