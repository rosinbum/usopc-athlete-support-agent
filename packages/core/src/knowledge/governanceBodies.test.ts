import { describe, it, expect } from "vitest";
import {
  GOVERNANCE_BODIES,
  buildDisambiguationReference,
} from "./governanceBodies.js";

describe("GOVERNANCE_BODIES", () => {
  it("is a non-empty array", () => {
    expect(GOVERNANCE_BODIES.length).toBeGreaterThan(0);
  });

  it("every entry has required fields", () => {
    for (const body of GOVERNANCE_BODIES) {
      expect(body.canonicalName).toBeTruthy();
      expect(["usopc", "ngb", "if"]).toContain(body.level);
      expect(Array.isArray(body.aliases)).toBe(true);
      expect(body.disambiguationNote).toBeTruthy();
    }
  });

  it("includes the USOPC AAC with Team USA Athletes' Commission as alias", () => {
    const aac = GOVERNANCE_BODIES.find((b) =>
      b.canonicalName.includes("USOPC Athletes' Advisory Council"),
    );
    expect(aac).toBeDefined();
    expect(aac!.aliases).toContain("Team USA Athletes' Commission");
  });

  it("known confusable entities cross-reference each other", () => {
    for (const body of GOVERNANCE_BODIES) {
      if (!body.confusableWith) continue;
      for (const confusableName of body.confusableWith) {
        const other = GOVERNANCE_BODIES.find(
          (b) => b.canonicalName === confusableName,
        );
        // The confusable target must exist in the registry
        expect(
          other,
          `${body.canonicalName} references confusable "${confusableName}" which is not in the registry`,
        ).toBeDefined();
        // And it should reference back
        if (other?.confusableWith) {
          expect(
            other.confusableWith,
            `${confusableName} should reference back to ${body.canonicalName}`,
          ).toContain(body.canonicalName);
        }
      }
    }
  });
});

describe("buildDisambiguationReference", () => {
  it("returns a non-empty string", () => {
    const result = buildDisambiguationReference();
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes canonical names", () => {
    const result = buildDisambiguationReference();
    expect(result).toContain("USOPC Athletes' Advisory Council");
    expect(result).toContain("NGB Athletes' Advisory Councils");
    expect(result).toContain("IF Athletes' Commissions");
    expect(result).toContain("Athlete Ombuds");
    expect(result).toContain("U.S. Center for SafeSport");
  });

  it("includes alias information", () => {
    const result = buildDisambiguationReference();
    expect(result).toContain("Team USA Athletes' Commission");
    expect(result).toContain("Also known as:");
  });

  it("includes disambiguation notes", () => {
    const result = buildDisambiguationReference();
    expect(result).toContain("same body");
  });

  it("includes confusability warnings", () => {
    const result = buildDisambiguationReference();
    expect(result).toContain("Often confused with:");
  });

  it("includes org level labels", () => {
    const result = buildDisambiguationReference();
    expect(result).toContain("USOPC level");
    expect(result).toContain("NGB level");
    expect(result).toContain("IF level");
  });
});
