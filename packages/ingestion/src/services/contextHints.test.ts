import { describe, it, expect } from "vitest";
import {
  getHintsByNgb,
  getHintsByDomain,
  getAllNgbHints,
  getKeywordsByTopic,
  getAllTopicKeywords,
  generateContextHint,
  type NgbHints,
} from "./contextHints.js";

describe("contextHints", () => {
  describe("getHintsByNgb", () => {
    it("should return hints for USA Swimming", () => {
      const hints = getHintsByNgb("usa-swimming");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-swimming");
      expect(hints?.displayName).toBe("USA Swimming");
      expect(hints?.domain).toBe("usaswimming.org");
      expect(hints?.topicDomains).toContain("team_selection");
      expect(hints?.topicDomains).toContain("safesport");
      expect(hints?.keywords).toContain("USA Swimming");
    });

    it("should return hints for USA Track & Field", () => {
      const hints = getHintsByNgb("usa-track-field");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-track-field");
      expect(hints?.displayName).toBe("USA Track & Field");
      expect(hints?.domain).toBe("usatf.org");
      expect(hints?.urlPatterns).toContain("/selection");
      expect(hints?.documentTypes).toContain("selection_procedures");
    });

    it("should return hints for USA Gymnastics", () => {
      const hints = getHintsByNgb("usa-gymnastics");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-gymnastics");
      expect(hints?.domain).toBe("usagym.org");
      expect(hints?.topicDomains).toContain("safesport");
    });

    it("should return hints for USA Basketball", () => {
      const hints = getHintsByNgb("usa-basketball");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-basketball");
      expect(hints?.domain).toBe("usabasketball.com");
    });

    it("should return hints for USA Hockey", () => {
      const hints = getHintsByNgb("usa-hockey");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-hockey");
      expect(hints?.domain).toBe("usahockey.com");
    });

    it("should return undefined for unknown NGB", () => {
      const hints = getHintsByNgb("unknown-ngb");

      expect(hints).toBeUndefined();
    });
  });

  describe("getHintsByDomain", () => {
    it("should return hints for usaswimming.org", () => {
      const hints = getHintsByDomain("usaswimming.org");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-swimming");
      expect(hints?.domain).toBe("usaswimming.org");
    });

    it("should return hints for usatf.org", () => {
      const hints = getHintsByDomain("usatf.org");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-track-field");
    });

    it("should return hints for usagym.org", () => {
      const hints = getHintsByDomain("usagym.org");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-gymnastics");
    });

    it("should return hints for usabasketball.com", () => {
      const hints = getHintsByDomain("usabasketball.com");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-basketball");
    });

    it("should return hints for usahockey.com", () => {
      const hints = getHintsByDomain("usahockey.com");

      expect(hints).toBeDefined();
      expect(hints?.ngbId).toBe("usa-hockey");
    });

    it("should return undefined for unknown domain", () => {
      const hints = getHintsByDomain("example.com");

      expect(hints).toBeUndefined();
    });
  });

  describe("getAllNgbHints", () => {
    it("should return all 5 NGB hints", () => {
      const hints = getAllNgbHints();

      expect(hints).toHaveLength(5);
      expect(hints.map((h) => h.ngbId)).toEqual(
        expect.arrayContaining([
          "usa-track-field",
          "usa-swimming",
          "usa-gymnastics",
          "usa-basketball",
          "usa-hockey",
        ]),
      );
    });

    it("should have consistent structure for all NGBs", () => {
      const hints = getAllNgbHints();

      hints.forEach((hint) => {
        expect(hint.ngbId).toBeTruthy();
        expect(hint.displayName).toBeTruthy();
        expect(hint.domain).toBeTruthy();
        expect(Array.isArray(hint.urlPatterns)).toBe(true);
        expect(hint.urlPatterns.length).toBeGreaterThan(0);
        expect(Array.isArray(hint.documentTypes)).toBe(true);
        expect(hint.documentTypes.length).toBeGreaterThan(0);
        expect(Array.isArray(hint.topicDomains)).toBe(true);
        expect(hint.topicDomains.length).toBeGreaterThan(0);
        expect(Array.isArray(hint.keywords)).toBe(true);
        expect(hint.keywords.length).toBeGreaterThan(0);
      });
    });
  });

  describe("getKeywordsByTopic", () => {
    it("should return keywords for team_selection", () => {
      const keywords = getKeywordsByTopic("team_selection");

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain("team selection");
      expect(keywords).toContain("Olympic trials");
      expect(keywords).toContain("qualification standards");
    });

    it("should return keywords for safesport", () => {
      const keywords = getKeywordsByTopic("safesport");

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain("SafeSport");
      expect(keywords).toContain("athlete safety");
    });

    it("should return keywords for anti_doping", () => {
      const keywords = getKeywordsByTopic("anti_doping");

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain("anti-doping");
      expect(keywords).toContain("USADA");
    });

    it("should return keywords for dispute_resolution", () => {
      const keywords = getKeywordsByTopic("dispute_resolution");

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain("grievance");
      expect(keywords).toContain("arbitration");
    });

    it("should return keywords for eligibility", () => {
      const keywords = getKeywordsByTopic("eligibility");

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain("eligibility");
      expect(keywords).toContain("athlete eligibility");
    });

    it("should return keywords for governance", () => {
      const keywords = getKeywordsByTopic("governance");

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain("bylaws");
      expect(keywords).toContain("governance");
    });

    it("should return keywords for athlete_rights", () => {
      const keywords = getKeywordsByTopic("athlete_rights");

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain("athlete rights");
      expect(keywords).toContain("athlete ombudsman");
    });
  });

  describe("getAllTopicKeywords", () => {
    it("should return mappings for all 7 topic domains", () => {
      const mappings = getAllTopicKeywords();

      expect(mappings).toHaveLength(7);
      expect(mappings.map((m) => m.domain)).toEqual(
        expect.arrayContaining([
          "team_selection",
          "dispute_resolution",
          "safesport",
          "anti_doping",
          "eligibility",
          "governance",
          "athlete_rights",
        ]),
      );
    });

    it("should have keywords for each topic domain", () => {
      const mappings = getAllTopicKeywords();

      mappings.forEach((mapping) => {
        expect(mapping.domain).toBeTruthy();
        expect(Array.isArray(mapping.keywords)).toBe(true);
        expect(mapping.keywords.length).toBeGreaterThan(0);
      });
    });
  });

  describe("generateContextHint", () => {
    it("should generate hint for USA Swimming URL", () => {
      const hint = generateContextHint("https://usaswimming.org/selection");

      expect(hint).toContain("USA Swimming");
      expect(hint).toContain("usa-swimming");
      expect(hint).toContain("team_selection");
      expect(hint).toContain("safesport");
      expect(hint).toContain("selection_procedures");
    });

    it("should generate hint for USATF URL", () => {
      const hint = generateContextHint("https://usatf.org/athlete/");

      expect(hint).toContain("USA Track & Field");
      expect(hint).toContain("usa-track-field");
      expect(hint).toContain("team_selection");
    });

    it("should generate hint for USA Gymnastics URL", () => {
      const hint = generateContextHint("https://usagym.org/safesport");

      expect(hint).toContain("USA Gymnastics");
      expect(hint).toContain("usa-gymnastics");
      expect(hint).toContain("safesport");
    });

    it("should return empty string for unknown domain", () => {
      const hint = generateContextHint("https://example.com/page");

      expect(hint).toBe("");
    });

    it("should handle URL with path and query params", () => {
      const hint = generateContextHint(
        "https://usabasketball.com/about/?foo=bar",
      );

      expect(hint).toContain("USA Basketball");
      expect(hint).toContain("usa-basketball");
    });
  });
});
