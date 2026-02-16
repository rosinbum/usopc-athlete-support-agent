import { describe, it, expect } from "vitest";
import { isCitationAnnotation } from "./citation.js";

describe("isCitationAnnotation", () => {
  it("returns true for a valid citation annotation", () => {
    const annotation = {
      type: "citations",
      citations: [
        { title: "Test", documentType: "policy", snippet: "snippet" },
      ],
    };
    expect(isCitationAnnotation(annotation)).toBe(true);
  });

  it("returns true for empty citations array", () => {
    expect(isCitationAnnotation({ type: "citations", citations: [] })).toBe(
      true,
    );
  });

  it("returns false for null", () => {
    expect(isCitationAnnotation(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isCitationAnnotation(undefined)).toBe(false);
  });

  it("returns false for wrong type value", () => {
    expect(isCitationAnnotation({ type: "error", citations: [] })).toBe(false);
  });

  it("returns false for missing citations field", () => {
    expect(isCitationAnnotation({ type: "citations" })).toBe(false);
  });

  it("returns false for non-array citations", () => {
    expect(
      isCitationAnnotation({ type: "citations", citations: "not-an-array" }),
    ).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isCitationAnnotation("citations")).toBe(false);
  });
});
