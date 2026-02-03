import { describe, it, expect } from "vitest";
import { buildSynthesizerPrompt, SYNTHESIZER_PROMPT } from "./synthesizer.js";

describe("buildSynthesizerPrompt", () => {
  const context = "[Document 1]\nTest context";
  const userQuestion = "What is the deadline?";

  it("includes context and question in the prompt", () => {
    const prompt = buildSynthesizerPrompt(context, userQuestion);

    expect(prompt).toContain(context);
    expect(prompt).toContain(userQuestion);
  });

  it("uses general format when no intent is provided", () => {
    const prompt = buildSynthesizerPrompt(context, userQuestion);

    // General format has 5 sections
    expect(prompt).toContain("**Direct Answer**");
    expect(prompt).toContain("**Details & Context**");
    expect(prompt).toContain("**Deadlines / Time Constraints**");
    expect(prompt).toContain("**Next Steps**");
    expect(prompt).toContain("**Sources**");
  });

  it("uses general format for undefined intent", () => {
    const prompt = buildSynthesizerPrompt(context, userQuestion, undefined);

    expect(prompt).toContain("**Direct Answer**");
    expect(prompt).toContain("**Sources**");
  });

  it("uses factual format for factual intent", () => {
    const prompt = buildSynthesizerPrompt(context, userQuestion, "factual");

    expect(prompt).toContain("**factual** question");
    expect(prompt).toContain("**Answer**: 1-3 sentences");
    expect(prompt).toContain("**Source**: Document title");
    expect(prompt).toContain("under 150 words");
    // Should NOT have the full format sections
    expect(prompt).not.toContain("**Details & Context**");
    expect(prompt).not.toContain("**Next Steps**");
  });

  it("uses procedural format for procedural intent", () => {
    const prompt = buildSynthesizerPrompt(context, userQuestion, "procedural");

    expect(prompt).toContain("**procedural** question");
    expect(prompt).toContain("**Overview**");
    expect(prompt).toContain("**Steps**: Numbered list");
    expect(prompt).toContain("**Source**: Document title");
    expect(prompt).toContain("under 300 words");
    // Should NOT have the full format sections
    expect(prompt).not.toContain("**Direct Answer**");
    expect(prompt).not.toContain("**Next Steps**");
  });

  it("uses deadline format for deadline intent", () => {
    const prompt = buildSynthesizerPrompt(context, userQuestion, "deadline");

    expect(prompt).toContain("**deadline** question");
    expect(prompt).toContain("**Deadline**: The specific date");
    expect(prompt).toContain("**Key Dates**");
    expect(prompt).toContain("**Source**: Document title");
    expect(prompt).toContain("under 100 words");
    // Should NOT have the full format sections
    expect(prompt).not.toContain("**Direct Answer**");
    expect(prompt).not.toContain("**Details & Context**");
  });

  it("uses general format for general intent", () => {
    const prompt = buildSynthesizerPrompt(context, userQuestion, "general");

    expect(prompt).toContain("**Direct Answer**");
    expect(prompt).toContain("**Details & Context**");
    expect(prompt).toContain("**Sources**");
  });

  it("uses general format for escalation intent", () => {
    const prompt = buildSynthesizerPrompt(context, userQuestion, "escalation");

    expect(prompt).toContain("**Direct Answer**");
    expect(prompt).toContain("**Sources**");
  });

  it("always includes base instructions regardless of intent", () => {
    const factualPrompt = buildSynthesizerPrompt(
      context,
      userQuestion,
      "factual",
    );
    const generalPrompt = buildSynthesizerPrompt(
      context,
      userQuestion,
      "general",
    );

    // Base instructions should be in all formats
    const baseInstructions = [
      "Synthesize an accurate answer",
      "Cite specific sections",
      "Distinguish between organizations",
      "Flag potentially outdated information",
      "Acknowledge gaps",
      "Never fabricate",
      "Use clear, accessible language",
    ];

    for (const instruction of baseInstructions) {
      expect(factualPrompt).toContain(instruction);
      expect(generalPrompt).toContain(instruction);
    }
  });

  it("includes the system role description in all prompts", () => {
    const intents = ["factual", "procedural", "deadline", "general"] as const;

    for (const intent of intents) {
      const prompt = buildSynthesizerPrompt(context, userQuestion, intent);
      expect(prompt).toContain(
        "You are the response synthesizer for the USOPC Athlete Support Assistant",
      );
    }
  });
});

describe("SYNTHESIZER_PROMPT (legacy)", () => {
  it("contains template placeholders", () => {
    expect(SYNTHESIZER_PROMPT).toContain("{{context}}");
    expect(SYNTHESIZER_PROMPT).toContain("{{userQuestion}}");
  });

  it("uses the full general format", () => {
    expect(SYNTHESIZER_PROMPT).toContain("**Direct Answer**");
    expect(SYNTHESIZER_PROMPT).toContain("**Details & Context**");
    expect(SYNTHESIZER_PROMPT).toContain("**Deadlines / Time Constraints**");
    expect(SYNTHESIZER_PROMPT).toContain("**Next Steps**");
    expect(SYNTHESIZER_PROMPT).toContain("**Sources**");
  });
});
