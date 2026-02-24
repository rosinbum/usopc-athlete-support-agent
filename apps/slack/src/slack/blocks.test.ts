import { describe, it, expect } from "vitest";
import {
  buildAnswerBlocks,
  buildErrorBlocks,
  buildThinkingBlock,
} from "./blocks.js";

describe("buildAnswerBlocks", () => {
  it("includes disclaimer context block when disclaimer is provided", () => {
    const blocks = buildAnswerBlocks(
      "Test answer",
      [],
      "This is not legal advice.",
    );

    const contextBlocks = blocks.filter(
      (b) =>
        b.type === "context" &&
        Array.isArray(b.elements) &&
        (b.elements as { text?: string }[]).some((e) => e.text?.includes("⚠️")),
    );
    expect(contextBlocks).toHaveLength(1);
  });

  it("omits disclaimer context block when disclaimer is undefined", () => {
    const blocks = buildAnswerBlocks("Test answer", []);

    const contextBlocks = blocks.filter(
      (b) =>
        b.type === "context" &&
        Array.isArray(b.elements) &&
        (b.elements as { text?: string }[]).some((e) => e.text?.includes("⚠️")),
    );
    expect(contextBlocks).toHaveLength(0);
  });

  it("always includes feedback action buttons", () => {
    const blocks = buildAnswerBlocks("Test answer", []);

    const actionBlocks = blocks.filter((b) => b.type === "actions");
    expect(actionBlocks).toHaveLength(1);
  });

  it("generates unique feedback block_id across invocations", () => {
    const blocks1 = buildAnswerBlocks("Answer 1", []);
    const blocks2 = buildAnswerBlocks("Answer 2", []);

    const id1 = blocks1.find((b) => b.type === "actions")!.block_id;
    const id2 = blocks2.find((b) => b.type === "actions")!.block_id;

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  it("renders citations when provided", () => {
    const blocks = buildAnswerBlocks("Answer", [
      { title: "Bylaws", documentType: "policy", snippet: "..." },
    ]);

    const sourceHeader = blocks.find(
      (b) => b.type === "section" && b.text?.text === "*Sources:*",
    );
    expect(sourceHeader).toBeDefined();
  });

  it("renders escalation block when provided", () => {
    const blocks = buildAnswerBlocks("Answer", [], undefined, {
      target: "SafeSport",
      organization: "SafeSport",
      reason: "Contact SafeSport for abuse concerns.",
      urgency: "immediate",
      contactEmail: "help@safesport.org",
    });

    const escalationBlock = blocks.find(
      (b) => b.type === "section" && b.text?.text?.includes("SafeSport"),
    );
    expect(escalationBlock).toBeDefined();
  });
});

describe("buildErrorBlocks", () => {
  it("renders error message and support context", () => {
    const blocks = buildErrorBlocks("Something went wrong");

    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.text?.text).toContain("Something went wrong");
    expect(blocks[1]!.type).toBe("context");
  });
});

describe("buildThinkingBlock", () => {
  it("renders thinking indicator", () => {
    const block = buildThinkingBlock();

    expect(block.type).toBe("section");
    expect(block.text?.text).toContain("Looking into that");
  });
});
