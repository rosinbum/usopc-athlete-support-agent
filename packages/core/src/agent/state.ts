import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type {
  TopicDomain,
  QueryIntent,
  Citation,
  EscalationInfo,
  RetrievedDocument,
} from "../types/index.js";

/**
 * LangGraph agent state annotation for the USOPC Athlete Support Agent.
 *
 * Extends the built-in MessagesAnnotation (which provides the `messages`
 * array with its standard reducer) and adds all domain-specific fields
 * needed by the classifier, retriever, synthesizer, and guard nodes.
 */
export const AgentStateAnnotation = Annotation.Root({
  // Inherit the messages channel with its built-in add-messages reducer
  ...MessagesAnnotation.spec,

  /**
   * The classified topic domain for the current query.
   * Set by the classifier node.
   */
  topicDomain: Annotation<TopicDomain | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /**
   * NGB or sport organization IDs detected in the user message.
   * Set by the classifier node.
   */
  detectedNgbIds: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /**
   * The classified intent of the user query (factual, procedural, deadline,
   * escalation, or general). Set by the classifier node.
   */
  queryIntent: Annotation<QueryIntent | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /**
   * Documents retrieved from the vector store, each with content, metadata,
   * and a relevance score. Set by the retriever node.
   */
  retrievedDocuments: Annotation<RetrievedDocument[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /**
   * Results from web search (Tavily) when retrieval confidence is too low.
   * Set by the researcher node.
   */
  webSearchResults: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /**
   * A 0-1 confidence score reflecting how well the retrieved documents
   * match the user query. Set by the retriever node.
   */
  retrievalConfidence: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),

  /**
   * Structured citations extracted from retrieved documents and/or
   * web search results. Built by the citationBuilder node.
   */
  citations: Annotation<Citation[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /**
   * The final synthesized answer text. Set by the synthesizer node,
   * then potentially modified by the disclaimerGuard node.
   */
  answer: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /**
   * Escalation information when the query requires referral to an
   * external authority. Set by the escalate node.
   */
  escalation: Annotation<EscalationInfo | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /**
   * Whether a disclaimer should be appended to the answer.
   * Defaults to true -- almost every response needs one.
   */
  disclaimerRequired: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => true,
  }),

  /**
   * Whether the user message contains time-sensitive language
   * (approaching deadlines, urgency signals). Set by the classifier.
   */
  hasTimeConstraint: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),

  /**
   * Persistent conversation identifier for multi-turn sessions.
   */
  conversationId: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /**
   * The sport the user is associated with, if known.
   */
  userSport: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /**
   * Whether the query is too ambiguous to answer accurately.
   * Set by the classifier node when clarification is needed.
   */
  needsClarification: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),

  /**
   * A clarifying question to ask the user when needsClarification is true.
   * Set by the classifier node.
   */
  clarificationQuestion: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /**
   * The reason the classifier flagged this query for escalation.
   * Set by the classifier node when shouldEscalate is true.
   * Used by the escalation node to generate context-aware responses.
   */
  escalationReason: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /**
   * Indicates whether the retriever node succeeded or encountered an error.
   * Downstream nodes (e.g. synthesizer) can use this to provide a
   * user-friendly error message instead of synthesizing from empty context.
   */
  retrievalStatus: Annotation<"success" | "error">({
    reducer: (_prev, next) => next,
    default: () => "success",
  }),
});

/**
 * Convenience type alias for the fully-resolved agent state.
 */
export type AgentState = typeof AgentStateAnnotation.State;
