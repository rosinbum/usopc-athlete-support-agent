import { describe, it, expect } from "vitest";
import { buildClassifierPrompt, CLASSIFIER_PROMPT } from "./classifier.js";

describe("buildClassifierPrompt", () => {
  it("replaces the {{userMessage}} placeholder", () => {
    const result = buildClassifierPrompt(
      "How do I file a Section 9 complaint?",
    );
    expect(result).toContain("How do I file a Section 9 complaint?");
    expect(result).not.toContain("{{userMessage}}");
  });

  it("preserves the rest of the template", () => {
    const result = buildClassifierPrompt("test");
    expect(result).toContain("topicDomain");
    expect(result).toContain("queryIntent");
    expect(result).toContain("detectedNgbIds");
    expect(result).toContain("hasTimeConstraint");
    expect(result).toContain("shouldEscalate");
  });
});

describe("CLASSIFIER_PROMPT", () => {
  it("contains the placeholder for user message", () => {
    expect(CLASSIFIER_PROMPT).toContain("{{userMessage}}");
  });

  it("lists all 7 topic domains", () => {
    const domains = [
      "team_selection",
      "dispute_resolution",
      "safesport",
      "anti_doping",
      "eligibility",
      "governance",
      "athlete_rights",
    ];
    for (const domain of domains) {
      expect(CLASSIFIER_PROMPT).toContain(`"${domain}"`);
    }
  });

  it("lists all 5 query intents", () => {
    const intents = [
      "factual",
      "procedural",
      "deadline",
      "escalation",
      "general",
    ];
    for (const intent of intents) {
      expect(CLASSIFIER_PROMPT).toContain(`"${intent}"`);
    }
  });
});
