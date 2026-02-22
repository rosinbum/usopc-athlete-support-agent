import { describe, it, expect, vi, afterEach } from "vitest";
import { buildResearcherPrompt } from "./researcher.js";

describe("buildResearcherPrompt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes the current message and conversation context", () => {
    const prompt = buildResearcherPrompt(
      "When do they need to replace the athlete?",
      "User: USA Judo removed an AC alternate rep\nAssistant: I can help with that.",
      "governance",
    );

    expect(prompt).toContain("When do they need to replace the athlete?");
    expect(prompt).toContain("USA Judo removed an AC alternate rep");
  });

  it("includes domain context when topicDomain is provided", () => {
    const prompt = buildResearcherPrompt(
      "question",
      "some context",
      "governance",
    );

    expect(prompt).toContain('"governance"');
    expect(prompt).toContain("U.S. Olympic and Paralympic governance");
  });

  it("uses generic domain context when topicDomain is undefined", () => {
    const prompt = buildResearcherPrompt("question", "some context", undefined);

    expect(prompt).toContain(
      "The query is about U.S. Olympic and Paralympic governance.",
    );
    expect(prompt).not.toContain("query domain is");
  });

  it("embeds the current year", () => {
    const prompt = buildResearcherPrompt("question", "some context", undefined);

    const currentYear = new Date().getFullYear();
    expect(prompt).toContain(`The current year is ${currentYear}`);
    expect(prompt).toContain(`"${currentYear}"`);
  });

  it("uses a mocked year via fake timers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15"));

    const prompt = buildResearcherPrompt("question", "some context", undefined);

    expect(prompt).toContain("The current year is 2030");
    vi.useRealTimers();
  });

  it("instructs the model to return a JSON array", () => {
    const prompt = buildResearcherPrompt("question", "some context", undefined);

    expect(prompt).toContain("JSON array of strings");
    expect(prompt).toContain('["query 1"]');
  });

  it("includes guidance for performance and qualifying standards queries", () => {
    const prompt = buildResearcherPrompt(
      "What are the qualifying times for Olympic swimming?",
      "some context",
      "team_selection",
    );

    expect(prompt).toContain("qualifying times");
    expect(prompt).toContain("qualifying standards");
  });
});
