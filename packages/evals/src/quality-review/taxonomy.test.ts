import { describe, it, expect } from "vitest";
import {
  FAILURE_MODES,
  FEEDBACK_KEYS,
  SCORING_RUBRIC,
  getFailuresByNode,
  getFailuresBySeverity,
  parseFailureCodes,
} from "./taxonomy.js";

// ---------------------------------------------------------------------------
// FAILURE_MODES data integrity
// ---------------------------------------------------------------------------

describe("FAILURE_MODES", () => {
  it("has at least 40 failure codes", () => {
    expect(Object.keys(FAILURE_MODES).length).toBeGreaterThanOrEqual(40);
  });

  it("every entry has required fields", () => {
    for (const [code, mode] of Object.entries(FAILURE_MODES)) {
      expect(mode.label, `${code} missing label`).toBeTruthy();
      expect(mode.node, `${code} missing node`).toBeTruthy();
      expect(mode.severity, `${code} missing severity`).toBeTruthy();
      expect(mode.description, `${code} missing description`).toBeTruthy();
    }
  });

  it("severity values are valid", () => {
    const valid = new Set(["critical", "high", "medium", "low"]);
    for (const [code, mode] of Object.entries(FAILURE_MODES)) {
      expect(
        valid.has(mode.severity),
        `${code} has invalid severity: ${mode.severity}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// FEEDBACK_KEYS
// ---------------------------------------------------------------------------

describe("FEEDBACK_KEYS", () => {
  it("has 5 scoring dimensions", () => {
    expect(Object.keys(FEEDBACK_KEYS)).toHaveLength(5);
  });

  it("includes all expected keys", () => {
    const values = Object.values(FEEDBACK_KEYS);
    expect(values).toContain("quality");
    expect(values).toContain("accuracy");
    expect(values).toContain("completeness");
    expect(values).toContain("helpfulness");
    expect(values).toContain("tone");
  });
});

// ---------------------------------------------------------------------------
// SCORING_RUBRIC
// ---------------------------------------------------------------------------

describe("SCORING_RUBRIC", () => {
  it("has a rubric for each feedback key", () => {
    const rubricKeys = SCORING_RUBRIC.map((r) => r.key);
    for (const value of Object.values(FEEDBACK_KEYS)) {
      expect(rubricKeys, `missing rubric for ${value}`).toContain(value);
    }
  });

  it("each rubric has 5 levels (0.0, 0.25, 0.5, 0.75, 1.0)", () => {
    for (const rubric of SCORING_RUBRIC) {
      expect(rubric.levels, `${rubric.key} should have 5 levels`).toHaveLength(
        5,
      );
      const scores = rubric.levels.map((l) => l.score);
      expect(scores).toEqual([0.0, 0.25, 0.5, 0.75, 1.0]);
    }
  });
});

// ---------------------------------------------------------------------------
// getFailuresByNode
// ---------------------------------------------------------------------------

describe("getFailuresByNode", () => {
  it("returns failures for classifier node", () => {
    const result = getFailuresByNode("classifier");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((fm) => fm.node === "classifier")).toBe(true);
  });

  it("returns empty array for non-existent node", () => {
    expect(getFailuresByNode("nonexistent" as never)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFailuresBySeverity
// ---------------------------------------------------------------------------

describe("getFailuresBySeverity", () => {
  it("returns failures for critical severity", () => {
    const result = getFailuresBySeverity("critical");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((fm) => fm.severity === "critical")).toBe(true);
  });

  it("returns all failure modes when combined across severities", () => {
    const all = [
      ...getFailuresBySeverity("critical"),
      ...getFailuresBySeverity("high"),
      ...getFailuresBySeverity("medium"),
      ...getFailuresBySeverity("low"),
    ];
    expect(all.length).toBe(Object.keys(FAILURE_MODES).length);
  });
});

// ---------------------------------------------------------------------------
// parseFailureCodes
// ---------------------------------------------------------------------------

describe("parseFailureCodes", () => {
  it("parses comma-separated valid codes", () => {
    const result = parseFailureCodes("DIS_MISSING,SYN_HALLUCINATION");
    expect(result).toEqual(["DIS_MISSING", "SYN_HALLUCINATION"]);
  });

  it("filters out invalid codes", () => {
    const result = parseFailureCodes(
      "DIS_MISSING,INVALID_CODE,SYN_HALLUCINATION",
    );
    expect(result).toEqual(["DIS_MISSING", "SYN_HALLUCINATION"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseFailureCodes("")).toEqual([]);
    expect(parseFailureCodes("   ")).toEqual([]);
  });

  it("handles whitespace around codes", () => {
    const result = parseFailureCodes(" DIS_MISSING , SYN_HALLUCINATION ");
    expect(result).toEqual(["DIS_MISSING", "SYN_HALLUCINATION"]);
  });

  it("returns empty for all invalid codes", () => {
    expect(parseFailureCodes("FAKE_1,FAKE_2")).toEqual([]);
  });
});
