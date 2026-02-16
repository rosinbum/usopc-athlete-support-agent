import { describe, it, expect } from "vitest";
import {
  getAcknowledgment,
  getSafetyResources,
  getToneModifiers,
  getGuidance,
} from "./emotionalSupport.js";
import type { EmotionalState, TopicDomain } from "../types/index.js";

const NON_NEUTRAL_STATES: Exclude<EmotionalState, "neutral">[] = [
  "distressed",
  "panicked",
  "fearful",
];

const ALL_DOMAINS: TopicDomain[] = [
  "safesport",
  "anti_doping",
  "dispute_resolution",
  "team_selection",
  "eligibility",
  "governance",
  "athlete_rights",
];

describe("getAcknowledgment", () => {
  it("returns empty string for neutral state", () => {
    expect(getAcknowledgment("neutral", "safesport")).toBe("");
  });

  it.each(NON_NEUTRAL_STATES)(
    "returns non-empty acknowledgment for %s state with each domain",
    (state) => {
      for (const domain of ALL_DOMAINS) {
        const result = getAcknowledgment(state, domain);
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(10);
      }
    },
  );

  it.each(NON_NEUTRAL_STATES)(
    "returns non-empty fallback for %s when domain is undefined",
    (state) => {
      const result = getAcknowledgment(state, undefined);
      expect(result).toBeTruthy();
    },
  );
});

describe("getSafetyResources", () => {
  it("includes mental health resource for all domains", () => {
    for (const domain of ALL_DOMAINS) {
      const resources = getSafetyResources(domain);
      expect(resources.some((r) => r.includes("1-888-602-9002"))).toBe(true);
    }
  });

  it("includes mental health resource when domain is undefined", () => {
    const resources = getSafetyResources(undefined);
    expect(resources.some((r) => r.includes("1-888-602-9002"))).toBe(true);
  });

  it("includes SafeSport hotline for safesport domain", () => {
    const resources = getSafetyResources("safesport");
    expect(resources.some((r) => r.includes("833-587-7233"))).toBe(true);
  });

  it("includes USADA number for anti_doping domain", () => {
    const resources = getSafetyResources("anti_doping");
    expect(resources.some((r) => r.includes("1-866-601-2632"))).toBe(true);
  });

  it("includes Athlete Ombuds for dispute_resolution domain", () => {
    const resources = getSafetyResources("dispute_resolution");
    expect(resources.some((r) => r.includes("719-866-5000"))).toBe(true);
  });
});

describe("getToneModifiers", () => {
  it("returns empty array for neutral state", () => {
    expect(getToneModifiers("neutral")).toEqual([]);
  });

  it.each(NON_NEUTRAL_STATES)(
    "returns non-empty array for %s state",
    (state) => {
      const modifiers = getToneModifiers(state);
      expect(modifiers.length).toBeGreaterThan(0);
      for (const m of modifiers) {
        expect(typeof m).toBe("string");
        expect(m.length).toBeGreaterThan(0);
      }
    },
  );
});

describe("getGuidance", () => {
  it("returns empty string for neutral state", () => {
    expect(getGuidance("neutral", "safesport")).toBe("");
  });

  it.each(NON_NEUTRAL_STATES)(
    "returns non-empty guidance for %s with specific domains",
    (state) => {
      for (const domain of [
        "safesport",
        "anti_doping",
        "dispute_resolution",
      ] as TopicDomain[]) {
        const result = getGuidance(state, domain);
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(10);
      }
    },
  );

  it.each(NON_NEUTRAL_STATES)(
    "returns non-empty fallback for %s when domain is undefined",
    (state) => {
      const result = getGuidance(state, undefined);
      expect(result).toBeTruthy();
    },
  );
});
