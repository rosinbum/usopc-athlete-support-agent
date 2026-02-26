import { describe, it, expect } from "vitest";
import {
  trigrams,
  jaccardSimilarity,
  deduplicateChunks,
} from "./deduplicateChunks.js";
import type { RetrievedDocument } from "../types/index.js";

function makeDoc(
  content: string,
  score: number,
  metadata: Partial<RetrievedDocument["metadata"]> = {},
): RetrievedDocument {
  return {
    content,
    metadata: { ...metadata },
    score,
  };
}

describe("trigrams", () => {
  it("returns empty set for text shorter than 3 characters", () => {
    expect(trigrams("ab").size).toBe(0);
    expect(trigrams("").size).toBe(0);
  });

  it("extracts character trigrams from normalized text", () => {
    const result = trigrams("abcd");
    expect(result).toEqual(new Set(["abc", "bcd"]));
  });

  it("normalizes whitespace and case", () => {
    const result = trigrams("A  B  C D");
    const expected = trigrams("a b c d");
    expect(result).toEqual(expected);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 0 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("returns 1 for identical sets", () => {
    const s = new Set(["abc", "bcd", "cde"]);
    expect(jaccardSimilarity(s, s)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = new Set(["abc", "bcd"]);
    const b = new Set(["xyz", "yza"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns correct value for partially overlapping sets", () => {
    const a = new Set(["abc", "bcd", "cde"]);
    const b = new Set(["abc", "bcd", "xyz"]);
    // intersection = 2, union = 4
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5, 5);
  });

  it("handles one empty set", () => {
    const a = new Set(["abc"]);
    expect(jaccardSimilarity(a, new Set())).toBe(0);
    expect(jaccardSimilarity(new Set(), a)).toBe(0);
  });
});

describe("deduplicateChunks", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateChunks([])).toEqual([]);
  });

  it("returns single doc unchanged", () => {
    const doc = makeDoc("some content here for testing", 0.9);
    const result = deduplicateChunks([doc]);
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe("some content here for testing");
  });

  it("returns all docs when no duplicates", () => {
    const docs = [
      makeDoc(
        "The athlete selection criteria for swimming involves multiple rounds of trials and time standards",
        0.9,
      ),
      makeDoc(
        "Anti-doping regulations require all competitors to submit to random testing throughout the competition period",
        0.8,
      ),
      makeDoc(
        "Governance structures within the USOPC include athlete advisory councils and board oversight committees",
        0.7,
      ),
    ];
    const result = deduplicateChunks(docs);
    expect(result).toHaveLength(3);
  });

  it("merges exact duplicates and populates alternativeSources", () => {
    const docs = [
      makeDoc("The exact same policy language appears in both documents", 0.9, {
        documentTitle: "Doc A",
        sourceUrl: "https://a.com",
      }),
      makeDoc("The exact same policy language appears in both documents", 0.8, {
        documentTitle: "Doc B",
        sourceUrl: "https://b.com",
      }),
    ];
    const result = deduplicateChunks(docs);
    expect(result).toHaveLength(1);
    expect(result[0]!.score).toBe(0.9);
    expect(result[0]!.metadata.alternativeSources).toHaveLength(1);
    expect(result[0]!.metadata.alternativeSources![0]!.documentTitle).toBe(
      "Doc B",
    );
    expect(result[0]!.metadata.alternativeSources![0]!.score).toBe(0.8);
  });

  it("merges near-duplicates above threshold", () => {
    // Use a long base with a tiny variation — Jaccard on trigrams must be >= 0.85
    const base =
      "Athletes must complete the qualification process which includes meeting minimum performance standards set by the international federation and the national governing body. " +
      "The qualification criteria shall be published no later than twelve months before the opening ceremony of the Games. " +
      "Each national governing body shall establish selection procedures consistent with these requirements and submit them for approval.";
    // Tiny suffix won't drop Jaccard below 0.85 on a ~350-char base
    const variant = base.replace("twelve months", "twelve (12) months");
    const docs = [makeDoc(base, 0.9), makeDoc(variant, 0.85)];
    const result = deduplicateChunks(docs);
    expect(result).toHaveLength(1);
  });

  it("keeps near-duplicates below threshold separate", () => {
    const docs = [
      makeDoc(
        "The athlete selection criteria for swimming involves multiple rounds of trials and time standards set by the national governing body",
        0.9,
      ),
      makeDoc(
        "Anti-doping regulations require all competitors to submit to random testing throughout the competition period according to WADA guidelines",
        0.8,
      ),
    ];
    const result = deduplicateChunks(docs);
    expect(result).toHaveLength(2);
  });

  it("selects representative by highest authority level", () => {
    const content =
      "The exact same policy language appears in both the federal law and the educational guidance document for reference";
    const docs = [
      makeDoc(content, 0.9, {
        documentTitle: "Guide",
        authorityLevel: "educational_guidance",
      }),
      makeDoc(content, 0.8, {
        documentTitle: "Federal Law",
        authorityLevel: "law",
      }),
    ];
    const result = deduplicateChunks(docs);
    expect(result).toHaveLength(1);
    // "law" has higher authority (lower index) despite lower score
    expect(result[0]!.metadata.documentTitle).toBe("Federal Law");
    expect(result[0]!.score).toBe(0.8);
    expect(result[0]!.metadata.alternativeSources![0]!.documentTitle).toBe(
      "Guide",
    );
  });

  it("uses score as tiebreaker when authority is the same", () => {
    const content =
      "The exact same policy language appears in multiple NGB policy documents for compliance purposes";
    const docs = [
      makeDoc(content, 0.7, {
        documentTitle: "NGB Policy A",
        authorityLevel: "ngb_policy_procedure",
      }),
      makeDoc(content, 0.9, {
        documentTitle: "NGB Policy B",
        authorityLevel: "ngb_policy_procedure",
      }),
    ];
    const result = deduplicateChunks(docs);
    expect(result).toHaveLength(1);
    expect(result[0]!.metadata.documentTitle).toBe("NGB Policy B");
    expect(result[0]!.score).toBe(0.9);
  });

  it("clusters transitively similar documents (A~B, B~C)", () => {
    const baseText =
      "Athletes must meet the qualification standards established by USOPC and the international federation for their sport discipline in order to be eligible";
    // A and B are very similar
    const textA = baseText;
    const textB = baseText + " category";
    // B and C are very similar
    const textC = baseText + " category requirements";
    // A and C may not be similar enough directly, but transitive via B
    const docs = [
      makeDoc(textA, 0.9, { documentTitle: "A" }),
      makeDoc(textB, 0.85, { documentTitle: "B" }),
      makeDoc(textC, 0.8, { documentTitle: "C" }),
    ];
    const result = deduplicateChunks(docs);
    // All should be clustered together
    expect(result).toHaveLength(1);
    expect(result[0]!.metadata.alternativeSources!.length).toBe(2);
  });

  it("sorts output by score descending", () => {
    const docs = [
      makeDoc(
        "Unique document about athlete selection criteria and swimming trials qualification process",
        0.5,
      ),
      makeDoc(
        "Another unique document about anti-doping testing protocols during international competition events",
        0.9,
      ),
      makeDoc(
        "Third unique document about governance structures including athlete advisory council oversight",
        0.7,
      ),
    ];
    const result = deduplicateChunks(docs);
    expect(result).toHaveLength(3);
    expect(result[0]!.score).toBe(0.9);
    expect(result[1]!.score).toBe(0.7);
    expect(result[2]!.score).toBe(0.5);
  });

  it("accepts custom threshold parameter", () => {
    const content =
      "The policy language that appears in both documents for compliance with federal regulations";
    const docs = [
      makeDoc(content, 0.9, { documentTitle: "A" }),
      makeDoc(content, 0.8, { documentTitle: "B" }),
    ];
    // With threshold 1.0, even exact dupes won't merge (Jaccard < 1.0 due to
    // how trigram sets work on identical strings — actually they will be 1.0)
    // Use threshold > 1.0 to guarantee no merge
    const result = deduplicateChunks(docs, 1.01);
    expect(result).toHaveLength(2);
  });

  it("does not add alternativeSources when there are no siblings", () => {
    const docs = [
      makeDoc(
        "Unique document about athlete selection criteria and swimming trials qualification process",
        0.9,
      ),
      makeDoc(
        "Different document about anti-doping testing protocols during international competition events",
        0.8,
      ),
    ];
    const result = deduplicateChunks(docs);
    expect(result).toHaveLength(2);
    expect(result[0]!.metadata.alternativeSources).toBeUndefined();
    expect(result[1]!.metadata.alternativeSources).toBeUndefined();
  });
});
