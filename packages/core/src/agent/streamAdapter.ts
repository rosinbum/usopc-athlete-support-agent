import type { Citation, EscalationInfo } from "../types/index.js";
import type { AgentState } from "./state.js";

export interface AgentStreamEvent {
  type: "text-delta" | "citations" | "escalation" | "done";
  textDelta?: string;
  citations?: Citation[];
  escalation?: EscalationInfo;
}

/**
 * Converts a LangGraph state stream into a sequence of AgentStreamEvents.
 *
 * Tracks the answer field across state updates and emits only new text deltas.
 * Emits citations and escalation events when those fields first appear in state.
 */
export async function* agentStreamToEvents(
  stateStream: AsyncIterable<Partial<AgentState>>,
): AsyncGenerator<AgentStreamEvent> {
  let previousAnswer = "";
  let citationsEmitted = false;
  let escalationEmitted = false;

  for await (const state of stateStream) {
    // Emit text delta if the answer grew
    if (
      state.answer !== undefined &&
      state.answer.length > previousAnswer.length
    ) {
      const delta = state.answer.slice(previousAnswer.length);
      previousAnswer = state.answer;
      yield { type: "text-delta", textDelta: delta };
    }

    // Emit citations once when they first appear (non-empty)
    if (!citationsEmitted && state.citations && state.citations.length > 0) {
      citationsEmitted = true;
      yield { type: "citations", citations: state.citations };
    }

    // Emit escalation once when it first appears
    if (!escalationEmitted && state.escalation) {
      escalationEmitted = true;
      yield { type: "escalation", escalation: state.escalation };
    }
  }

  yield { type: "done" };
}
