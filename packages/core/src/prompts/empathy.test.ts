import { describe, it, expect } from "vitest";
import {
  getEmpathyPreamble,
  withEmpathy,
  getEmotionalToneGuidance,
  MENTAL_HEALTH_RESOURCE,
} from "./empathy.js";
import type { EmotionalState } from "../types/index.js";

describe("getEmpathyPreamble", () => {
  it("returns empty string for neutral", () => {
    expect(getEmpathyPreamble("neutral")).toBe("");
  });

  it("returns preamble for distressed", () => {
    const preamble = getEmpathyPreamble("distressed");
    expect(preamble).toContain("what you're feeling is valid");
    expect(preamble).toContain(MENTAL_HEALTH_RESOURCE);
  });

  it("returns preamble for panicked", () => {
    const preamble = getEmpathyPreamble("panicked");
    expect(preamble).toContain("Take a breath");
    expect(preamble).toContain("concrete steps");
  });

  it("returns preamble for fearful", () => {
    const preamble = getEmpathyPreamble("fearful");
    expect(preamble).toContain("retaliation protections");
    expect(preamble).toContain("confidential");
  });

  it("includes mental health resource in distressed preamble", () => {
    const preamble = getEmpathyPreamble("distressed");
    expect(preamble).toContain("1-888-602-9002");
  });
});

describe("withEmpathy", () => {
  it("is a no-op for neutral state", () => {
    const answer = "Here are the selection procedures...";
    expect(withEmpathy(answer, "neutral")).toBe(answer);
  });

  it("prepends preamble for distressed state", () => {
    const answer = "Here are the appeal options...";
    const result = withEmpathy(answer, "distressed");
    expect(result).toContain("what you're feeling is valid");
    expect(result).toContain(answer);
    expect(result.indexOf("what you're feeling is valid")).toBeLessThan(
      result.indexOf(answer),
    );
  });

  it("prepends preamble for panicked state", () => {
    const answer = "Contact USADA immediately.";
    const result = withEmpathy(answer, "panicked");
    expect(result).toContain("Take a breath");
    expect(result).toContain(answer);
  });

  it("prepends preamble for fearful state", () => {
    const answer = "Report to SafeSport.";
    const result = withEmpathy(answer, "fearful");
    expect(result).toContain("retaliation protections");
    expect(result).toContain(answer);
  });

  const nonNeutralStates: EmotionalState[] = [
    "distressed",
    "panicked",
    "fearful",
  ];
  for (const state of nonNeutralStates) {
    it(`preamble comes before the answer for ${state}`, () => {
      const answer = "Procedural content here.";
      const result = withEmpathy(answer, state);
      expect(result.endsWith(answer)).toBe(true);
    });
  }
});

describe("getEmotionalToneGuidance", () => {
  it("returns empty string for neutral", () => {
    expect(getEmotionalToneGuidance("neutral")).toBe("");
  });

  it("returns tone guidance for distressed", () => {
    const guidance = getEmotionalToneGuidance("distressed");
    expect(guidance).toContain("TONE GUIDANCE");
    expect(guidance).toContain("warm, supportive");
  });

  it("returns tone guidance for panicked", () => {
    const guidance = getEmotionalToneGuidance("panicked");
    expect(guidance).toContain("TONE GUIDANCE");
    expect(guidance).toContain("calm, reassuring");
  });

  it("returns tone guidance for fearful", () => {
    const guidance = getEmotionalToneGuidance("fearful");
    expect(guidance).toContain("TONE GUIDANCE");
    expect(guidance).toContain("confidentiality");
    expect(guidance).toContain("anti-retaliation");
  });
});
