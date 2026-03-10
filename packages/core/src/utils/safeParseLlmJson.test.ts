import { describe, it, expect } from "vitest";
import { parseLlmJson } from "./safeParseLlmJson.js";

describe("parseLlmJson", () => {
  it("parses plain JSON object", () => {
    const result = parseLlmJson('{"intent":"question","confidence":0.9}');
    expect(result).toEqual({ intent: "question", confidence: 0.9 });
  });

  it("parses JSON array", () => {
    const result = parseLlmJson("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("strips markdown json fences", () => {
    const input = '```json\n{"intent":"question"}\n```';
    expect(parseLlmJson(input)).toEqual({ intent: "question" });
  });

  it("strips markdown fences without language tag", () => {
    const input = '```\n{"intent":"question"}\n```';
    expect(parseLlmJson(input)).toEqual({ intent: "question" });
  });

  it("trims leading and trailing whitespace", () => {
    const input = '  \n  {"key":"value"}  \n  ';
    expect(parseLlmJson(input)).toEqual({ key: "value" });
  });

  it("throws on oversized input", () => {
    const oversized = '{"data":"' + "x".repeat(60_000) + '"}';
    expect(() => parseLlmJson(oversized)).toThrow(
      /LLM output too large for JSON parsing/,
    );
  });

  it("throws on invalid JSON", () => {
    expect(() => parseLlmJson("{not valid json}")).toThrow();
  });

  it("throws on empty string", () => {
    expect(() => parseLlmJson("")).toThrow();
  });

  it("handles nested objects correctly", () => {
    const input = '```json\n{"queries":[{"text":"foo","weight":1}]}\n```';
    expect(parseLlmJson(input)).toEqual({
      queries: [{ text: "foo", weight: 1 }],
    });
  });

  it("does not strip fences from mid-string backticks", () => {
    const input = '{"code":"use ```backticks``` here"}';
    expect(parseLlmJson(input)).toEqual({
      code: "use ```backticks``` here",
    });
  });
});
