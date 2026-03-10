import { describe, it, expect, vi } from "vitest";

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    logger: {
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
  };
});

import { disclaimerGuardNode } from "./disclaimerGuard.js";
import { makeDefaultState, type AgentState } from "../state.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return makeDefaultState(overrides);
}

describe("disclaimerGuardNode", () => {
  it("returns empty object when there is no answer", async () => {
    const state = makeState({ answer: undefined });
    const result = await disclaimerGuardNode(state);
    expect(result).toEqual({});
  });

  it("sets disclaimer field with general disclaimer text", async () => {
    const state = makeState({ answer: "Here is your answer." });
    const result = await disclaimerGuardNode(state);
    expect(result.disclaimer).toContain("does not constitute legal advice");
    expect(result.answer).toBeUndefined();
    expect(result.disclaimerRequired).toBe(true);
  });

  it("sets safesport-specific disclaimer for safesport domain", async () => {
    const state = makeState({
      answer: "SafeSport answer.",
      topicDomain: "safesport",
    });
    const result = await disclaimerGuardNode(state);
    expect(result.disclaimer).toContain("call 911");
    expect(result.answer).toBeUndefined();
  });

  it("sets anti-doping disclaimer for anti_doping domain", async () => {
    const state = makeState({
      answer: "Anti-doping answer.",
      topicDomain: "anti_doping",
    });
    const result = await disclaimerGuardNode(state);
    expect(result.disclaimer).toContain("USADA");
    expect(result.answer).toBeUndefined();
  });

  it("sets dispute resolution disclaimer for dispute_resolution domain", async () => {
    const state = makeState({
      answer: "Dispute answer.",
      topicDomain: "dispute_resolution",
    });
    const result = await disclaimerGuardNode(state);
    expect(result.disclaimer).toContain("Section 9 arbitration");
  });

  it("sets general disclaimer when topicDomain is undefined", async () => {
    const state = makeState({
      answer: "General answer.",
      topicDomain: undefined,
    });
    const result = await disclaimerGuardNode(state);
    expect(result.disclaimer).toContain("does not constitute legal advice");
  });

  it("does not modify the answer text", async () => {
    const state = makeState({ answer: "Answer text." });
    const result = await disclaimerGuardNode(state);
    expect(result.answer).toBeUndefined();
    expect(result.disclaimer).toBeDefined();
  });
});
