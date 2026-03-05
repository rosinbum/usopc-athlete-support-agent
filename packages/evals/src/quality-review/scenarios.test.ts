import { describe, it, expect } from "vitest";
import {
  qualityReviewScenarios,
  getScenariosByCategory,
  getScenariosByDifficulty,
  getSingleTurnScenarios,
  getMultiTurnScenarios,
  type ScenarioCategory,
} from "./scenarios.js";

// ---------------------------------------------------------------------------
// Data integrity
// ---------------------------------------------------------------------------

describe("qualityReviewScenarios", () => {
  it("has ~60 scenarios", () => {
    expect(qualityReviewScenarios.length).toBeGreaterThanOrEqual(55);
    expect(qualityReviewScenarios.length).toBeLessThanOrEqual(65);
  });

  it("every scenario has a unique id", () => {
    const ids = qualityReviewScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every scenario has at least one message", () => {
    for (const s of qualityReviewScenarios) {
      expect(
        s.input.messages.length,
        `${s.id} has no messages`,
      ).toBeGreaterThan(0);
    }
  });

  it("every scenario has valid metadata", () => {
    for (const s of qualityReviewScenarios) {
      expect(s.metadata.category, `${s.id} missing category`).toBeTruthy();
      expect(s.metadata.difficulty, `${s.id} missing difficulty`).toBeTruthy();
      expect(
        s.metadata.description,
        `${s.id} missing description`,
      ).toBeTruthy();
      expect(s.metadata.domains, `${s.id} missing domains array`).toBeDefined();
    }
  });

  it("covers all 10 categories", () => {
    const categories = new Set(
      qualityReviewScenarios.map((s) => s.metadata.category),
    );
    const expected: ScenarioCategory[] = [
      "sport_specific",
      "cross_domain",
      "multi_turn",
      "ambiguous",
      "emotional_urgent",
      "boundary",
      "paralympic",
      "financial",
      "procedural_deep",
      "current_events",
    ];
    for (const cat of expected) {
      expect(categories.has(cat), `missing category: ${cat}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

describe("getScenariosByCategory", () => {
  it("returns only scenarios matching the category", () => {
    const result = getScenariosByCategory("sport_specific");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.metadata.category === "sport_specific")).toBe(
      true,
    );
  });

  it("returns empty for nonexistent category", () => {
    expect(getScenariosByCategory("fake" as ScenarioCategory)).toEqual([]);
  });
});

describe("getScenariosByDifficulty", () => {
  it("returns only scenarios matching the difficulty", () => {
    const result = getScenariosByDifficulty("hard");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.metadata.difficulty === "hard")).toBe(true);
  });
});

describe("getSingleTurnScenarios / getMultiTurnScenarios", () => {
  it("partitions all scenarios (no overlap, no gaps)", () => {
    const single = getSingleTurnScenarios();
    const multi = getMultiTurnScenarios();

    expect(single.length + multi.length).toBe(qualityReviewScenarios.length);

    const singleIds = new Set(single.map((s) => s.id));
    for (const m of multi) {
      expect(singleIds.has(m.id), `${m.id} in both single and multi`).toBe(
        false,
      );
    }
  });

  it("single-turn scenarios have exactly one user message", () => {
    for (const s of getSingleTurnScenarios()) {
      expect(s.input.messages).toHaveLength(1);
      expect(s.input.messages[0]!.role).toBe("user");
    }
  });

  it("multi-turn scenarios have >1 message or non-user first message", () => {
    for (const s of getMultiTurnScenarios()) {
      const isMulti =
        s.input.messages.length > 1 || s.input.messages[0]!.role !== "user";
      expect(isMulti, `${s.id} should be multi-turn`).toBe(true);
    }
  });
});
