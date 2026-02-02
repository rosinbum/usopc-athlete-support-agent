import { describe, it, expect } from "vitest";
import { getDisclaimer, getAllDisclaimers } from "./disclaimer.js";
import type { TopicDomain } from "../types/index.js";

describe("getDisclaimer", () => {
  it("returns the general disclaimer when no domain is provided", () => {
    const disclaimer = getDisclaimer();
    expect(disclaimer).toContain("educational purposes only");
    expect(disclaimer).toContain("does not constitute legal advice");
  });

  it("returns the general disclaimer for undefined domain", () => {
    const disclaimer = getDisclaimer(undefined);
    expect(disclaimer).toContain("educational purposes only");
  });

  const domainKeywords: Record<TopicDomain, string> = {
    team_selection: "selection procedures",
    dispute_resolution: "Section 9 arbitration",
    safesport: "call 911",
    anti_doping: "USADA",
    eligibility: "Eligibility requirements vary",
    governance: "Athletes' Commission",
    athlete_rights: "Athlete Bill of Rights",
  };

  for (const [domain, keyword] of Object.entries(domainKeywords)) {
    it(`returns domain-specific disclaimer for ${domain}`, () => {
      const disclaimer = getDisclaimer(domain as TopicDomain);
      expect(disclaimer).toContain(keyword);
    });
  }

  it("all domain disclaimers include the general not-legal-advice text", () => {
    const domains: TopicDomain[] = [
      "team_selection",
      "dispute_resolution",
      "safesport",
      "anti_doping",
      "eligibility",
      "governance",
      "athlete_rights",
    ];

    for (const domain of domains) {
      const disclaimer = getDisclaimer(domain);
      expect(disclaimer).toContain("does not constitute legal advice");
    }
  });
});

describe("getAllDisclaimers", () => {
  it("returns all 8 disclaimer templates (7 domains + general)", () => {
    const all = getAllDisclaimers();
    expect(all).toHaveLength(8);
  });

  it("includes a general disclaimer", () => {
    const all = getAllDisclaimers();
    const general = all.find((d) => d.domain === "general");
    expect(general).toBeDefined();
    expect(general!.text).toContain("educational purposes only");
  });

  it("each template has non-empty text", () => {
    const all = getAllDisclaimers();
    for (const template of all) {
      expect(template.text.length).toBeGreaterThan(0);
    }
  });
});
