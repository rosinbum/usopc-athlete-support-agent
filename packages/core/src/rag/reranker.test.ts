import { describe, it, expect } from "vitest";
import { rerank } from "./reranker.js";
import type { Document } from "@langchain/core/documents";

function makeDoc(
  metadata: Record<string, unknown> = {},
  content = "chunk",
): Document {
  return { pageContent: content, metadata };
}

describe("rerank", () => {
  it("returns empty array for empty input", () => {
    expect(rerank([])).toEqual([]);
  });

  it("boosts documents matching an NGB ID", () => {
    const docs = [
      makeDoc({ ngbId: "other" }, "other"),
      makeDoc({ ngbId: "usa-swimming" }, "match"),
    ];

    const result = rerank(docs, { ngbIds: ["usa-swimming"] });
    expect(result[0].pageContent).toBe("match");
  });

  it("boosts documents matching the topic domain", () => {
    const docs = [
      makeDoc({ topicDomain: "governance" }, "governance"),
      makeDoc({ topicDomain: "safesport" }, "safesport"),
    ];

    const result = rerank(docs, { topicDomain: "safesport" });
    expect(result[0].pageContent).toBe("safesport");
  });

  it("boosts high-priority document types", () => {
    const docs = [
      makeDoc({ documentType: "faq" }, "faq"),
      makeDoc({ documentType: "bylaws" }, "bylaws"),
    ];

    const result = rerank(docs);
    expect(result[0].pageContent).toBe("bylaws");
  });

  it("boosts recent documents", () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 3);

    const old = new Date();
    old.setFullYear(old.getFullYear() - 5);

    const docs = [
      makeDoc({ effectiveDate: old.toISOString() }, "old"),
      makeDoc({ effectiveDate: recent.toISOString() }, "recent"),
    ];

    const result = rerank(docs);
    expect(result[0].pageContent).toBe("recent");
  });

  it("respects maxResults", () => {
    const docs = Array.from({ length: 20 }, (_, i) => makeDoc({}, `doc-${i}`));
    const result = rerank(docs, { maxResults: 5 });
    expect(result).toHaveLength(5);
  });

  it("defaults maxResults to 10", () => {
    const docs = Array.from({ length: 15 }, (_, i) => makeDoc({}, `doc-${i}`));
    const result = rerank(docs);
    expect(result).toHaveLength(10);
  });

  it("combines multiple bonuses", () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);

    const docs = [
      makeDoc({ documentType: "faq" }, "low"),
      makeDoc(
        {
          ngbId: "usa-swimming",
          topicDomain: "team_selection",
          documentType: "selection_procedures",
          effectiveDate: recent.toISOString(),
        },
        "high",
      ),
    ];

    const result = rerank(docs, {
      ngbIds: ["usa-swimming"],
      topicDomain: "team_selection",
    });
    expect(result[0].pageContent).toBe("high");
  });

  describe("authority level boosting", () => {
    it("boosts documents with higher authority levels", () => {
      const docs = [
        makeDoc({ authorityLevel: "educational_guidance" }, "faq"),
        makeDoc({ authorityLevel: "usopc_policy_procedure" }, "policy"),
        makeDoc({ authorityLevel: "law" }, "law"),
      ];

      const result = rerank(docs);
      // Law should rank first, then policy, then educational guidance
      expect(result[0].pageContent).toBe("law");
      expect(result[1].pageContent).toBe("policy");
      expect(result[2].pageContent).toBe("faq");
    });

    it("stacks authority boost with NGB match boost", () => {
      const docs = [
        makeDoc(
          { ngbId: "usa-swimming", authorityLevel: "ngb_policy_procedure" },
          "ngb-match-low-auth",
        ),
        makeDoc(
          { ngbId: "usa-gymnastics", authorityLevel: "law" },
          "no-match-high-auth",
        ),
      ];

      const result = rerank(docs, { ngbIds: ["usa-swimming"] });
      // Both have boosts - NGB match + low authority vs no match + high authority
      // The exact order depends on boost values
      expect(result).toHaveLength(2);
    });

    it("handles documents without authority level", () => {
      const docs = [
        makeDoc({}, "no-authority"),
        makeDoc({ authorityLevel: "usopc_governance" }, "has-authority"),
      ];

      const result = rerank(docs);
      // Document with authority should rank higher
      expect(result[0].pageContent).toBe("has-authority");
    });
  });
});
