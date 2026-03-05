import { describe, it, expect } from "vitest";
import { compareScores } from "./compare-baseline.js";

function baseline(evaluators: Record<string, { mean: number | null }>) {
  return { version: "v1.0.0", date: "2026-01-01", evaluators };
}

describe("compareScores", () => {
  it("detects no changes when scores are identical", () => {
    const result = compareScores(baseline({ accuracy: { mean: 0.9 } }), {
      accuracy: 0.9,
    });
    expect(result.regressions).toEqual([]);
    expect(result.improvements).toEqual([]);
    expect(result.hasFailed).toBe(false);
  });

  it("detects fail regression (>10% drop)", () => {
    const result = compareScores(baseline({ accuracy: { mean: 1.0 } }), {
      accuracy: 0.85,
    });
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]!.severity).toBe("fail");
    expect(result.regressions[0]!.key).toBe("accuracy");
    expect(result.hasFailed).toBe(true);
  });

  it("detects warning regression (5-10% drop)", () => {
    const result = compareScores(baseline({ accuracy: { mean: 1.0 } }), {
      accuracy: 0.92,
    });
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]!.severity).toBe("warning");
    expect(result.hasFailed).toBe(false);
  });

  it("detects improvements (>5% gain)", () => {
    const result = compareScores(baseline({ accuracy: { mean: 0.8 } }), {
      accuracy: 0.9,
    });
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0]!.key).toBe("accuracy");
    expect(result.improvements[0]!.delta).toBeGreaterThan(0);
  });

  it("ignores null baseline entries", () => {
    const result = compareScores(baseline({ accuracy: { mean: null } }), {
      accuracy: 0.9,
    });
    expect(result.regressions).toEqual([]);
    expect(result.improvements).toEqual([]);
  });

  it("ignores missing current scores", () => {
    const result = compareScores(baseline({ accuracy: { mean: 0.9 } }), {});
    expect(result.regressions).toEqual([]);
  });

  it("handles multiple evaluators", () => {
    const result = compareScores(
      baseline({
        accuracy: { mean: 1.0 },
        tone: { mean: 0.5 },
        quality: { mean: 0.8 },
      }),
      { accuracy: 0.5, tone: 0.9, quality: 0.8 },
    );
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]!.key).toBe("accuracy");
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0]!.key).toBe("tone");
  });

  it("rounds delta to 3 decimal places", () => {
    const result = compareScores(baseline({ accuracy: { mean: 1.0 } }), {
      accuracy: 0.123456,
    });
    expect(result.regressions[0]!.delta).toBe(-0.877);
  });

  it("includes baseline version in result", () => {
    const result = compareScores(baseline({ accuracy: { mean: 0.9 } }), {
      accuracy: 0.9,
    });
    expect(result.baselineVersion).toBe("v1.0.0");
  });
});
