import { describe, it, expect } from "vitest";
import { snakeToLabel, camelToLabel } from "./format-label.js";

describe("snakeToLabel", () => {
  it("converts underscores to spaces and capitalizes words", () => {
    expect(snakeToLabel("topic_domain")).toBe("Topic Domain");
  });

  it("handles single words", () => {
    expect(snakeToLabel("policy")).toBe("Policy");
  });

  it("handles multiple underscores", () => {
    expect(snakeToLabel("authority_level_high")).toBe("Authority Level High");
  });

  it("handles already capitalized input", () => {
    expect(snakeToLabel("PDF")).toBe("PDF");
  });
});

describe("camelToLabel", () => {
  it("splits on capital letters and capitalizes first letter", () => {
    expect(camelToLabel("topicDomain")).toBe("Topic Domain");
  });

  it("handles single words", () => {
    expect(camelToLabel("title")).toBe("Title");
  });

  it("handles consecutive capitals (acronyms)", () => {
    expect(camelToLabel("ngbID")).toBe("Ngb I D");
  });

  it("handles already capitalized first letter", () => {
    expect(camelToLabel("SourceUrl")).toBe("Source Url");
  });
});
