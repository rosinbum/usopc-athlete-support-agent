import { describe, it, expect } from "vitest";
import {
  ESCALATION_TARGETS,
  getEscalationTargets,
  buildEscalation,
  buildEscalationPrompt,
} from "./escalation.js";
import type { TopicDomain } from "../types/agent.js";

describe("ESCALATION_TARGETS", () => {
  it("contains 6 escalation targets", () => {
    expect(ESCALATION_TARGETS).toHaveLength(6);
  });

  it("includes SafeSport center", () => {
    const safesport = ESCALATION_TARGETS.find(
      (t) => t.id === "safesport_center",
    );
    expect(safesport).toBeDefined();
    expect(safesport!.urgencyDefault).toBe("immediate");
  });

  it("includes USADA", () => {
    const usada = ESCALATION_TARGETS.find((t) => t.id === "usada");
    expect(usada).toBeDefined();
    expect(usada!.urgencyDefault).toBe("immediate");
  });

  it("includes Athlete Ombuds", () => {
    const ombuds = ESCALATION_TARGETS.find((t) => t.id === "athlete_ombuds");
    expect(ombuds).toBeDefined();
    expect(ombuds!.contactEmail).toBe("ombudsman@usathlete.org");
  });
});

describe("getEscalationTargets", () => {
  it("returns SafeSport targets for safesport domain", () => {
    const targets = getEscalationTargets("safesport");
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets.some((t) => t.id === "safesport_center")).toBe(true);
  });

  it("returns USADA target for anti_doping domain", () => {
    const targets = getEscalationTargets("anti_doping");
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets.some((t) => t.id === "usada")).toBe(true);
  });

  it("returns Athlete Ombuds for dispute_resolution domain", () => {
    const targets = getEscalationTargets("dispute_resolution");
    expect(targets.some((t) => t.id === "athlete_ombuds")).toBe(true);
  });

  it("returns Athlete Ombuds for team_selection domain", () => {
    const targets = getEscalationTargets("team_selection");
    expect(targets.some((t) => t.id === "athlete_ombuds")).toBe(true);
  });

  it("returns Athletes' Commission for governance domain", () => {
    const targets = getEscalationTargets("governance");
    expect(targets.some((t) => t.id === "athletes_commission")).toBe(true);
  });

  it("returns targets for every defined domain", () => {
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
      const targets = getEscalationTargets(domain);
      expect(targets.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("buildEscalation", () => {
  it("builds an EscalationInfo for safesport", () => {
    const result = buildEscalation("safesport", "abuse report", "immediate");
    expect(result).toBeDefined();
    expect(result!.organization).toBe("U.S. Center for SafeSport");
    expect(result!.urgency).toBe("immediate");
    expect(result!.reason).toBe("abuse report");
  });

  it("builds an EscalationInfo for anti_doping", () => {
    const result = buildEscalation("anti_doping", "testing question");
    expect(result).toBeDefined();
    expect(result!.target).toBe("usada");
    expect(result!.urgency).toBe("immediate");
  });

  it("uses the target's default urgency when none is provided", () => {
    const result = buildEscalation("dispute_resolution", "need help");
    expect(result).toBeDefined();
    expect(result!.urgency).toBe("standard");
  });

  it("overrides default urgency when urgency is specified", () => {
    const result = buildEscalation(
      "dispute_resolution",
      "urgent deadline",
      "immediate",
    );
    expect(result).toBeDefined();
    expect(result!.urgency).toBe("immediate");
  });

  it("returns the primary target's contact info", () => {
    const result = buildEscalation("team_selection", "selection concern");
    expect(result).toBeDefined();
    expect(result!.contactEmail).toBe("ombudsman@usathlete.org");
    expect(result!.contactPhone).toBe("719-866-5000");
  });
});

describe("buildEscalationPrompt", () => {
  it("fills in the user message and classification result", () => {
    const prompt = buildEscalationPrompt(
      "I want to report abuse",
      '{"topicDomain":"safesport"}',
    );
    expect(prompt).toContain("I want to report abuse");
    expect(prompt).toContain('{"topicDomain":"safesport"}');
  });

  it("includes escalation target descriptions", () => {
    const prompt = buildEscalationPrompt("test", "test");
    expect(prompt).toContain("Athlete Ombuds");
    expect(prompt).toContain("U.S. Center for SafeSport");
    expect(prompt).toContain("USADA");
  });
});
