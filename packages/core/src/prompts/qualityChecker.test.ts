import { describe, it, expect } from "vitest";
import { buildQualityCheckerPrompt } from "./qualityChecker.js";

describe("buildQualityCheckerPrompt", () => {
  it("includes the answer, question, context, and intent", () => {
    const prompt = buildQualityCheckerPrompt(
      "Section 9 allows athletes to file arbitration within 30 days.",
      "How do I file a Section 9 arbitration complaint?",
      "[Document 1]\nTitle: USOPC Bylaws\nSection 9 procedures...",
      "procedural",
    );

    expect(prompt).toContain(
      "Section 9 allows athletes to file arbitration within 30 days.",
    );
    expect(prompt).toContain(
      "How do I file a Section 9 arbitration complaint?",
    );
    expect(prompt).toContain("USOPC Bylaws");
    expect(prompt).toContain("procedural");
  });

  it("uses 'general' when queryIntent is undefined", () => {
    const prompt = buildQualityCheckerPrompt(
      "Some answer",
      "Some question",
      "Some context",
    );

    expect(prompt).toContain("general");
  });

  it("includes evaluation criteria", () => {
    const prompt = buildQualityCheckerPrompt(
      "answer",
      "question",
      "context",
      "factual",
    );

    expect(prompt).toContain("Specificity");
    expect(prompt).toContain("Grounding");
    expect(prompt).toContain("Completeness");
  });

  it("includes issue type definitions", () => {
    const prompt = buildQualityCheckerPrompt("answer", "question", "context");

    expect(prompt).toContain("generic_response");
    expect(prompt).toContain("hallucination_signal");
    expect(prompt).toContain("incomplete");
    expect(prompt).toContain("missing_specificity");
  });
});
