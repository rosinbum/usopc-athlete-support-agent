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
  const reference = buildDisambiguationReference();

  it("returns a non-empty string", () => {
    expect(reference.length).toBeGreaterThan(0);
  });

  it("includes canonical names", () => {
    expect(reference).toContain("USOPC Athletes' Advisory Council");
    expect(reference).toContain("NGB Athletes' Advisory Councils");
    expect(reference).toContain("IF Athletes' Commissions");
    expect(reference).toContain("Athlete Ombuds");
    expect(reference).toContain("U.S. Center for SafeSport");
  });

  it("includes alias information", () => {
    expect(reference).toContain("Team USA Athletes' Commission");
    expect(reference).toContain("Also known as:");
  });

  it("includes disambiguation notes", () => {
    expect(reference).toContain("same body");
  });

  it("includes confusability warnings", () => {
    expect(reference).toContain("Often confused with:");
  });

  it("includes org level labels", () => {
    expect(reference).toContain("USOPC level");
    expect(reference).toContain("NGB level");
    expect(reference).toContain("IF level");
  });
});
