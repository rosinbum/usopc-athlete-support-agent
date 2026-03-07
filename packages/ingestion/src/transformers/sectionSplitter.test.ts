import { describe, it, expect } from "vitest";
import type { Document } from "@langchain/core/documents";
import { sectionAwareSplit } from "./sectionSplitter.js";

function doc(
  content: string,
  metadata: Record<string, unknown> = {},
): Document {
  return { pageContent: content, metadata };
}

describe("sectionAwareSplit", () => {
  it("keeps a small section as a single chunk with section_title", async () => {
    const input = doc("ARTICLE I: Purpose\nThis is the purpose section.");
    const chunks = await sectionAwareSplit([input]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.metadata.section_title).toBe("ARTICLE I: Purpose");
    expect(chunks[0]!.pageContent).toContain("ARTICLE I: Purpose");
    expect(chunks[0]!.pageContent).toContain("This is the purpose section.");
  });

  it("splits a large section and propagates section_title to all sub-chunks", async () => {
    const longContent = "SECTION 1.1: Definitions\n" + "word ".repeat(600); // ~3000 chars
    const input = doc(longContent);
    const chunks = await sectionAwareSplit([input], { chunkSize: 1500 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.metadata.section_title).toBe("SECTION 1.1: Definitions");
    }
  });

  it("produces distinct section_title values for multiple sections", async () => {
    const content = [
      "ARTICLE I: Governance",
      "The governance framework establishes the rules and procedures for the organization.",
      "",
      "ARTICLE II: Membership",
      "Membership rules apply to all athletes and organizations within the federation.",
    ].join("\n");
    const input = doc(content);
    const chunks = await sectionAwareSplit([input]);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.metadata.section_title).toBe("ARTICLE I: Governance");
    expect(chunks[1]!.metadata.section_title).toBe("ARTICLE II: Membership");
  });

  it("falls back to standard splitter for documents with no headings", async () => {
    const longContent = "paragraph ".repeat(500); // ~5000 chars, no headings
    const input = doc(longContent);
    const chunks = await sectionAwareSplit([input], { chunkSize: 1500 });

    expect(chunks.length).toBeGreaterThan(1);
    // No section titles detected
    for (const chunk of chunks) {
      expect(chunk.metadata.section_title).toBeUndefined();
    }
  });

  it("sets section_title to undefined for preamble before first heading", async () => {
    const content = [
      "This is preamble text before any section.",
      "",
      "SECTION 2.1: Scope",
      "Scope details here.",
    ].join("\n");
    const input = doc(content);
    const chunks = await sectionAwareSplit([input]);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.metadata.section_title).toBeUndefined();
    expect(chunks[0]!.pageContent).toContain("preamble");
    expect(chunks[1]!.metadata.section_title).toBe("SECTION 2.1: Scope");
  });

  it("preserves heading text in chunk content", async () => {
    const input = doc("Rule 4.2: Eligibility\nAthletes must meet criteria.");
    const chunks = await sectionAwareSplit([input]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.pageContent).toContain("Rule 4.2: Eligibility");
  });

  it("preserves original document metadata on all chunks", async () => {
    const input = doc("CHAPTER 3: Appeals\nAppeals process.", {
      source: "https://example.com/bylaws.pdf",
      format: "pdf",
    });
    const chunks = await sectionAwareSplit([input]);

    expect(chunks[0]!.metadata.source).toBe("https://example.com/bylaws.pdf");
    expect(chunks[0]!.metadata.format).toBe("pdf");
    expect(chunks[0]!.metadata.section_title).toBe("CHAPTER 3: Appeals");
  });

  it("handles PART headings", async () => {
    const content = [
      "PART I: General Provisions",
      "General provisions text that applies to all members of the organization and affiliates.",
      "",
      "PART II: Specific Rules",
      "Specific rules text governing the conduct and responsibilities of each participating body.",
    ].join("\n");
    const chunks = await sectionAwareSplit([doc(content)]);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.metadata.section_title).toBe(
      "PART I: General Provisions",
    );
    expect(chunks[1]!.metadata.section_title).toBe("PART II: Specific Rules");
  });

  it("handles mixed heading types in one document", async () => {
    const content = [
      "ARTICLE III: Organization",
      "The organizational structure of the corporation is defined by the following provisions and rules.",
      "",
      "SECTION 3.1: Board Composition",
      "The board shall consist of no fewer than fifteen members appointed according to these bylaws.",
      "",
      "Section 3.2: Committees",
      "Standing committees shall be established to oversee governance, finance, and athlete welfare.",
    ].join("\n");
    const chunks = await sectionAwareSplit([doc(content)]);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.metadata.section_title).toBe("ARTICLE III: Organization");
    expect(chunks[1]!.metadata.section_title).toBe(
      "SECTION 3.1: Board Composition",
    );
    expect(chunks[2]!.metadata.section_title).toBe("Section 3.2: Committees");
  });

  it("merges heading-only sections into the following section", async () => {
    const content = [
      "Section 3.9: The Chair.",
      "Section 3.9.1: Duties. The Chair will preside over all meetings of the Board and execute duties.",
    ].join("\n");
    const chunks = await sectionAwareSplit([doc(content)]);

    // "Section 3.9: The Chair." is < 50 chars, so it merges into 3.9.1
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.metadata.section_title).toBe(
      "Section 3.9.1: Duties. The Chair will preside over all meetings of the Board and execute duties.",
    );
    expect(chunks[0]!.pageContent).toContain("Section 3.9: The Chair.");
  });
});
