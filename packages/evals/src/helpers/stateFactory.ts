import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "@usopc/core";

/**
 * Creates a default AgentState for evaluation tests.
 * Mirrors the pattern from `packages/core/src/agent/nodes/classifier.test.ts`.
 */
export function makeTestState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("What are the team selection procedures?")],
    topicDomain: undefined,
    detectedNgbIds: [],
    queryIntent: undefined,
    retrievedDocuments: [],
    webSearchResults: [],
    retrievalConfidence: 0,
    citations: [],
    answer: undefined,
    escalation: undefined,
    disclaimerRequired: true,
    hasTimeConstraint: false,
    conversationId: undefined,
    conversationSummary: undefined,
    userSport: undefined,
    needsClarification: false,
    clarificationQuestion: undefined,
    escalationReason: undefined,
    retrievalStatus: "success",
    emotionalState: "neutral",
    emotionalSupportContext: undefined,
    qualityCheckResult: undefined,
    qualityRetryCount: 0,
    expansionAttempted: false,
    reformulatedQueries: [],
    isComplexQuery: false,
    subQueries: [],
    ...overrides,
  };
}
