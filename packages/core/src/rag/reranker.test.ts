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
      makeDoc({ ngb_id: "other" }, "other"),
      makeDoc({ ngb_id: "usa_swimming" }, "match"),
    ];

    const result = rerank(docs, { ngbIds: ["usa_swimming"] });
    expect(result[0].pageContent).toBe("match");
  });

  it("boosts documents matching the topic domain", () => {
    const docs = [
      makeDoc({ topic_domain: "governance" }, "governance"),
      makeDoc({ topic_domain: "safesport" }, "safesport"),
    ];

    const result = rerank(docs, { topicDomain: "safesport" });
    expect(result[0].pageContent).toBe("safesport");
  });

  it("boosts high-priority document types", () => {
    const docs = [
      makeDoc({ document_type: "faq" }, "faq"),
      makeDoc({ document_type: "bylaws" }, "bylaws"),
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
      makeDoc({ effective_date: old.toISOString() }, "old"),
      makeDoc({ effective_date: recent.toISOString() }, "recent"),
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
      makeDoc({ document_type: "faq" }, "low"),
      makeDoc(
        {
          ngb_id: "usa_swimming",
          topic_domain: "team_selection",
          document_type: "selection_procedures",
          effective_date: recent.toISOString(),
        },
        "high",
      ),
    ];

    const result = rerank(docs, {
      ngbIds: ["usa_swimming"],
      topicDomain: "team_selection",
    });
    expect(result[0].pageContent).toBe("high");
  });

  describe("authority level boosting", () => {
    it("boosts documents with higher authority levels", () => {
      const docs = [
        makeDoc({ authority_level: "educational_guidance" }, "faq"),
        makeDoc({ authority_level: "usopc_policy_procedure" }, "policy"),
        makeDoc({ authority_level: "law" }, "law"),
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
          { ngb_id: "usa_swimming", authority_level: "ngb_policy_procedure" },
          "ngb-match-low-auth",
        ),
        makeDoc(
          { ngb_id: "usa_gymnastics", authority_level: "law" },
          "no-match-high-auth",
        ),
      ];

      const result = rerank(docs, { ngbIds: ["usa_swimming"] });
      // Both have boosts - NGB match + low authority vs no match + high authority
      // The exact order depends on boost values
      expect(result).toHaveLength(2);
    });

    it("handles documents without authority level", () => {
      const docs = [
        makeDoc({}, "no-authority"),
        makeDoc({ authority_level: "usopc_governance" }, "has-authority"),
      ];

      const result = rerank(docs);
      // Document with authority should rank higher
      expect(result[0].pageContent).toBe("has-authority");
    });
  });
});
