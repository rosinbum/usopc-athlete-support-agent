import { describe, it, expect } from "vitest";
import { formatWebResult, buildContext } from "./buildContext.js";
import type { RetrievedDocument, WebSearchResult } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(
  overrides: Partial<RetrievedDocument> = {},
): RetrievedDocument {
  return {
    content: "Document content here.",
    metadata: {
      documentTitle: "Test Doc",
      authorityLevel: "usopc_governance",
      ...overrides.metadata,
    },
    score: 0.9,
    ...overrides,
  };
}

function makeWebResult(
  overrides: Partial<WebSearchResult> = {},
): WebSearchResult {
  return {
    url: "https://usopc.org/doc",
    title: "USOPC Document",
    content: "Web result content.",
    score: 0.85,
    authorityLevel: "usopc_governance",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatWebResult
// ---------------------------------------------------------------------------

describe("formatWebResult", () => {
  it("renders authority label when present", () => {
    const result = makeWebResult({ authorityLevel: "usopc_governance" });
    const formatted = formatWebResult(result, 0);

    expect(formatted).toContain("[Web Result 1]");
    expect(formatted).toContain("Title: USOPC Document");
    expect(formatted).toContain("URL: https://usopc.org/doc");
    expect(formatted).toContain("Authority Level: USOPC Governance");
    expect(formatted).toContain("Relevance Score: 0.8500");
    expect(formatted).toContain("Web result content.");
  });

  it("renders anti-doping authority label", () => {
    const result = makeWebResult({
      url: "https://usada.org/testing",
      title: "USADA Testing",
      authorityLevel: "anti_doping_national",
    });
    const formatted = formatWebResult(result, 0);
    expect(formatted).toContain("Authority Level: USADA Rules");
  });

  it("omits authority label when absent", () => {
    const result = makeWebResult({ authorityLevel: undefined });
    const formatted = formatWebResult(result, 0);

    expect(formatted).not.toContain("Authority Level:");
    expect(formatted).toContain("[Web Result 1]");
    expect(formatted).toContain("Title: USOPC Document");
  });

  it("uses correct index numbering", () => {
    const result = makeWebResult();
    expect(formatWebResult(result, 0)).toContain("[Web Result 1]");
    expect(formatWebResult(result, 4)).toContain("[Web Result 5]");
  });
});

// ---------------------------------------------------------------------------
// buildContext — interleaved mode
// ---------------------------------------------------------------------------

describe("buildContext — interleaved mode", () => {
  it("interleaves KB docs and web results by normalized score", () => {
    const docs: RetrievedDocument[] = [
      makeDoc({ score: 0.9, content: "KB high" }),
      makeDoc({ score: 0.5, content: "KB low" }),
    ];
    const webResults: WebSearchResult[] = [
      makeWebResult({ score: 0.95, content: "Web high" }),
      makeWebResult({ score: 0.4, content: "Web low" }),
    ];

    const context = buildContext({
      retrievedDocuments: docs,
      webSearchResults: [],
      webSearchResultUrls: webResults,
    });

    // Both KB and web results should appear
    expect(context).toContain("KB high");
    expect(context).toContain("Web high");
    expect(context).toContain("KB low");
    expect(context).toContain("Web low");

    // Web high (normalized 1.0) and KB high (normalized 1.0) should come before lows
    const kbHighIdx = context.indexOf("KB high");
    const webHighIdx = context.indexOf("Web high");
    const kbLowIdx = context.indexOf("KB low");
    const webLowIdx = context.indexOf("Web low");

    expect(kbHighIdx).toBeLessThan(kbLowIdx);
    expect(webHighIdx).toBeLessThan(webLowIdx);
  });

  it("handles web-only (no KB docs)", () => {
    const webResults: WebSearchResult[] = [
      makeWebResult({ score: 0.9, content: "Only web" }),
    ];

    const context = buildContext({
      retrievedDocuments: [],
      webSearchResults: [],
      webSearchResultUrls: webResults,
    });

    expect(context).toContain("Only web");
    expect(context).toContain("[Web Result 1]");
  });

  it("handles docs-only (empty webSearchResultUrls)", () => {
    const docs: RetrievedDocument[] = [makeDoc({ content: "Only doc" })];

    const context = buildContext({
      retrievedDocuments: docs,
      webSearchResults: [],
      webSearchResultUrls: [],
    });

    // Empty array falls back to legacy mode
    expect(context).toContain("Only doc");
    expect(context).toContain("[Document 1]");
  });

  it("includes authority labels in interleaved output", () => {
    const context = buildContext({
      retrievedDocuments: [
        makeDoc({
          score: 0.8,
          metadata: { authorityLevel: "usopc_governance" },
        }),
      ],
      webSearchResults: [],
      webSearchResultUrls: [
        makeWebResult({
          score: 0.7,
          authorityLevel: "anti_doping_national",
        }),
      ],
    });

    expect(context).toContain("Authority Level: USOPC Governance");
    expect(context).toContain("Authority Level: USADA Rules");
  });
});

// ---------------------------------------------------------------------------
// buildContext — legacy mode (backward compat)
// ---------------------------------------------------------------------------

describe("buildContext — legacy mode", () => {
  it("falls back to append mode when no webSearchResultUrls", () => {
    const context = buildContext({
      retrievedDocuments: [makeDoc({ content: "doc content" })],
      webSearchResults: ["web string result"],
    });

    expect(context).toContain("[Document 1]");
    expect(context).toContain("doc content");
    expect(context).toContain("[Web Search Results]");
    expect(context).toContain("web string result");
  });

  it("returns empty message when no results at all", () => {
    const context = buildContext({
      retrievedDocuments: [],
      webSearchResults: [],
    });

    expect(context).toBe(
      "No documents or search results were found for this query.",
    );
  });

  it("handles webSearchResults only (no docs)", () => {
    const context = buildContext({
      retrievedDocuments: [],
      webSearchResults: ["some web result"],
    });

    expect(context).toContain("[Web Search Results]");
    expect(context).toContain("some web result");
  });
});
