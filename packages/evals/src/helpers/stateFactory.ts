import { HumanMessage } from "@langchain/core/messages";
import { makeDefaultState, type AgentState } from "@usopc/core";

/**
 * Creates a default AgentState for evaluation tests.
 * Mirrors the pattern from `packages/core/src/agent/nodes/classifier.test.ts`.
 */
export function makeTestState(overrides: Partial<AgentState> = {}): AgentState {
  return makeDefaultState({
    messages: [new HumanMessage("What are the team selection procedures?")],
    ...overrides,
  });
}
