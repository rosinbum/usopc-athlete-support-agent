import { describe, it, expect } from "vitest";
import {
  buildClassifierPrompt,
  buildClassifierPromptWithHistory,
  CLASSIFIER_PROMPT,
} from "./classifier.js";

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

describe("buildClassifierPromptWithHistory", () => {
  it("includes conversation context section when history is provided", () => {
    const result = buildClassifierPromptWithHistory(
      "What about alternates?",
      "User: What are the team selection criteria for swimming?\nAssistant: USA Swimming selects athletes based on time standards.",
    );

    expect(result).toContain("## Conversation History");
    expect(result).toContain("team selection criteria for swimming");
    expect(result).toContain("What about alternates?");
  });

  it("omits conversation context section when history is empty", () => {
    const result = buildClassifierPromptWithHistory(
      "What are the selection criteria?",
      "",
    );

    expect(result).not.toContain("## Conversation History");
    expect(result).toContain("What are the selection criteria?");
  });

  it("includes instruction to use context for ambiguity resolution", () => {
    const result = buildClassifierPromptWithHistory(
      "What about alternates?",
      "User: What are the team selection criteria for swimming?",
    );

    expect(result).toContain(
      "Use this context from prior exchanges to inform your classification",
    );
  });

  it("places conversation history before user message", () => {
    const result = buildClassifierPromptWithHistory(
      "Current question",
      "User: Previous question\nAssistant: Previous answer",
    );

    const historyIndex = result.indexOf("## Conversation History");
    const messageIndex = result.indexOf("## User Message");
    expect(historyIndex).toBeLessThan(messageIndex);
  });

  it("includes all required classification fields", () => {
    const result = buildClassifierPromptWithHistory(
      "Test message",
      "User: Prior\nAssistant: Response",
    );

    expect(result).toContain("topicDomain");
    expect(result).toContain("queryIntent");
    expect(result).toContain("detectedNgbIds");
    expect(result).toContain("hasTimeConstraint");
    expect(result).toContain("shouldEscalate");
    expect(result).toContain("needsClarification");
  });
});

describe("CLASSIFIER_PROMPT", () => {
  it("contains the placeholder for user message", () => {
    expect(CLASSIFIER_PROMPT).toContain("{{userMessage}}");
  });

  it("includes canonical NGB IDs in the prompt", () => {
    expect(CLASSIFIER_PROMPT).toContain("usa-swimming");
    expect(CLASSIFIER_PROMPT).toContain("us-speedskating");
    expect(CLASSIFIER_PROMPT).toContain("usopc-breaking");
    expect(CLASSIFIER_PROMPT).toContain("us-ski-snowboard");
  });

  it("includes the single-NGB rule", () => {
    expect(CLASSIFIER_PROMPT).toContain("at most ONE NGB ID");
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

  it("includes universal framework terms for clarification guidance", () => {
    const terms = [
      "Section 9",
      "Section 10",
      "USOPC Bylaws",
      "USADA",
      "SafeSport",
      "Athlete Bill of Rights",
    ];
    for (const term of terms) {
      expect(CLASSIFIER_PROMPT).toContain(term);
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
