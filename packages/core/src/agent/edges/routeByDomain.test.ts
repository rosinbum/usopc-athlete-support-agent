import { describe, it, expect } from "vitest";
import { routeByDomain } from "./routeByDomain.js";
import { makeDefaultState, type AgentState } from "../state.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return makeDefaultState(overrides);
}

describe("routeByDomain", () => {
  it('returns "clarify" when needsClarification is true', () => {
    const state = makeState({ needsClarification: true });
    expect(routeByDomain(state)).toBe("clarify");
  });

  it('returns "clarify" even if escalation intent when clarification needed', () => {
    const state = makeState({
      queryIntent: "escalation",
      needsClarification: true,
    });
    expect(routeByDomain(state)).toBe("clarify");
  });

  it('returns "escalate" when queryIntent is escalation', () => {
    const state = makeState({ queryIntent: "escalation" });
    expect(routeByDomain(state)).toBe("escalate");
  });

  it('returns "queryPlanner" for factual intent', () => {
    const state = makeState({ queryIntent: "factual" });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });

  it('returns "queryPlanner" for procedural intent', () => {
    const state = makeState({ queryIntent: "procedural" });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });

  it('returns "queryPlanner" for deadline intent', () => {
    const state = makeState({ queryIntent: "deadline" });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });

  it('returns "queryPlanner" for general intent', () => {
    const state = makeState({ queryIntent: "general" });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });

  it('returns "queryPlanner" when queryIntent is undefined', () => {
    const state = makeState({ queryIntent: undefined });
    expect(routeByDomain(state)).toBe("queryPlanner");
  });
});
