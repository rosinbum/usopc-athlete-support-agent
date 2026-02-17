import { describe, it, expect, vi } from "vitest";

vi.mock("@usopc/shared", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { citationBuilderNode } from "./citationBuilder.js";
import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.js";
import type { RetrievedDocument } from "../../types/index.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [new HumanMessage("test")],
    topicDomain: undefined,
    detectedNgbIds: [],
    queryIntent: undefined,
    retrievedDocuments: [],
    webSearchResults: [],
    webSearchResultUrls: [],
    retrievalConfidence: 0,
    citations: [],
    answer: undefined,
    escalation: undefined,
    disclaimerRequired: true,
    hasTimeConstraint: false,
    conversationId: undefined,
    conversationSummary: undefined,
    userSport: undefined,
    needsClarification: false,
    clarificationQuestion: undefined,
    escalationReason: undefined,
    retrievalStatus: "success",
    emotionalState: "neutral",
    emotionalSupportContext: undefined,
    qualityCheckResult: undefined,
    qualityRetryCount: 0,
    expansionAttempted: false,
    reformulatedQueries: [],
    isComplexQuery: false,
    subQueries: [],
    ...overrides,
  };
}

function makeDoc(
  overrides: Partial<RetrievedDocument> = {},
): RetrievedDocument {
  return {
    content: "This is some document content for testing purposes.",
    metadata: {
      documentTitle: "Test Document",
      sourceUrl: "https://example.com/doc",
      documentType: "policy",
      sectionTitle: "Section 1",
      effectiveDate: "2024-01-01",
      ...overrides.metadata,
    },
    score: 0.1,
    ...overrides,
  };
}

describe("citationBuilderNode", () => {
  it("returns empty citations when there are no retrieved documents", async () => {
    const state = makeState({ retrievedDocuments: [] });
    const result = await citationBuilderNode(state);
    expect(result.citations).toEqual([]);
  });

  it("builds citations from retrieved documents", async () => {
    const state = makeState({
      retrievedDocuments: [
        makeDoc({
          metadata: {
            documentTitle: "USOPC Bylaws",
            sourceUrl: "https://usopc.org/bylaws",
            documentType: "bylaws",
            sectionTitle: "Article V",
            effectiveDate: "2024-06-01",
          },
        }),
      ],
    });

    const result = await citationBuilderNode(state);
    expect(result.citations).toHaveLength(1);
    expect(result.citations![0]).toMatchObject({
      title: "USOPC Bylaws",
      url: "https://usopc.org/bylaws",
      documentType: "bylaws",
      section: "Article V",
      effectiveDate: "2024-06-01",
    });
  });

  it("deduplicates citations by sourceUrl + sectionTitle + documentTitle", async () => {
    const doc = makeDoc();
    const state = makeState({
      retrievedDocuments: [doc, doc, doc],
    });

    const result = await citationBuilderNode(state);
    expect(result.citations).toHaveLength(1);
  });

  it("keeps documents with different keys as separate citations", async () => {
    const state = makeState({
      retrievedDocuments: [
        makeDoc({
          metadata: {
            documentTitle: "Doc A",
            sourceUrl: "https://a.com",
            sectionTitle: "Section 1",
          },
        }),
        makeDoc({
          metadata: {
            documentTitle: "Doc B",
            sourceUrl: "https://b.com",
            sectionTitle: "Section 2",
          },
        }),
      ],
    });

    const result = await citationBuilderNode(state);
    expect(result.citations).toHaveLength(2);
  });

  it("truncates snippet to 200 characters with ellipsis", async () => {
    const longContent = "A".repeat(300);
    const state = makeState({
      retrievedDocuments: [makeDoc({ content: longContent })],
    });

    const result = await citationBuilderNode(state);
    expect(result.citations![0].snippet).toHaveLength(203); // 200 + "..."
    expect(result.citations![0].snippet!.endsWith("...")).toBe(true);
  });

  it("does not add ellipsis to short content", async () => {
    const shortContent = "Short content.";
    const state = makeState({
      retrievedDocuments: [makeDoc({ content: shortContent })],
    });

    const result = await citationBuilderNode(state);
    expect(result.citations![0].snippet).toBe(shortContent);
  });

  it("uses 'Unknown Document' for missing document title", async () => {
    const state = makeState({
      retrievedDocuments: [makeDoc({ metadata: { documentTitle: undefined } })],
    });

    const result = await citationBuilderNode(state);
    expect(result.citations![0].title).toBe("Unknown Document");
  });

  it("uses 'document' for missing document type", async () => {
    const state = makeState({
      retrievedDocuments: [makeDoc({ metadata: { documentType: undefined } })],
    });

    const result = await citationBuilderNode(state);
    expect(result.citations![0].documentType).toBe("document");
  });

  it("includes authorityLevel when present in document metadata", async () => {
    const state = makeState({
      retrievedDocuments: [
        makeDoc({
          metadata: {
            documentTitle: "Ted Stevens Act",
            sourceUrl: "https://example.com/law",
            documentType: "legislation",
            authorityLevel: "law",
          },
        }),
      ],
    });

    const result = await citationBuilderNode(state);
    expect(result.citations![0].authorityLevel).toBe("law");
  });

  it("omits authorityLevel when not present in document metadata", async () => {
    const state = makeState({
      retrievedDocuments: [
        makeDoc({
          metadata: {
            documentTitle: "Legacy Document",
            sourceUrl: "https://example.com/legacy",
          },
        }),
      ],
    });

    const result = await citationBuilderNode(state);
    expect(result.citations![0].authorityLevel).toBeUndefined();
  });
});
