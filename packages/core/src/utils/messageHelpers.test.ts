import { describe, it, expect } from "vitest";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { isUserMessage, getLastUserMessage } from "./messageHelpers.js";

describe("isUserMessage", () => {
  it("returns true for HumanMessage", () => {
    expect(isUserMessage(new HumanMessage("hello"))).toBe(true);
  });

  it("returns false for AIMessage", () => {
    expect(isUserMessage(new AIMessage("response"))).toBe(false);
  });

  it("returns false for SystemMessage", () => {
    expect(isUserMessage(new SystemMessage("system"))).toBe(false);
  });
});

describe("getLastUserMessage", () => {
  it("returns the last human message content", () => {
    const messages = [
      new HumanMessage("first"),
      new AIMessage("response"),
      new HumanMessage("second"),
    ];
    expect(getLastUserMessage(messages)).toBe("second");
  });

  it("returns empty string when no user messages exist", () => {
    const messages = [new AIMessage("response"), new SystemMessage("system")];
    expect(getLastUserMessage(messages)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(getLastUserMessage([])).toBe("");
  });

  it("stringifies non-string content", () => {
    const msg = new HumanMessage({
      content: [{ type: "text", text: "hello" }],
    });
    const result = getLastUserMessage([msg]);
    expect(result).toContain("hello");
  });
});
