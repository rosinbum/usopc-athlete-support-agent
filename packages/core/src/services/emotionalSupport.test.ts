import { describe, it, expect } from "vitest";
import { generateSupportContext } from "./emotionalSupport.js";

describe("generateSupportContext", () => {
  it("returns undefined for neutral state", () => {
    expect(generateSupportContext("neutral", "safesport")).toBeUndefined();
  });

  it("returns undefined for neutral state without domain", () => {
    expect(generateSupportContext("neutral")).toBeUndefined();
  });

  it("returns complete context for distressed + safesport", () => {
    const ctx = generateSupportContext("distressed", "safesport");
    expect(ctx).toBeDefined();
    expect(ctx!.acknowledgment).toBeTruthy();
    expect(ctx!.guidance).toBeTruthy();
    expect(ctx!.safetyResources.length).toBeGreaterThan(0);
    expect(ctx!.toneModifiers.length).toBeGreaterThan(0);
    // SafeSport-specific resources
    expect(ctx!.safetyResources.some((r) => r.includes("833-587-7233"))).toBe(
      true,
    );
  });

  it("returns complete context for panicked without domain", () => {
    const ctx = generateSupportContext("panicked");
    expect(ctx).toBeDefined();
    expect(ctx!.acknowledgment).toBeTruthy();
    expect(ctx!.guidance).toBeTruthy();
    expect(ctx!.safetyResources.length).toBeGreaterThan(0);
    expect(ctx!.toneModifiers.length).toBeGreaterThan(0);
  });

  it("returns complete context for fearful + anti_doping", () => {
    const ctx = generateSupportContext("fearful", "anti_doping");
    expect(ctx).toBeDefined();
    expect(ctx!.acknowledgment).toContain("confidentiality");
    expect(ctx!.safetyResources.some((r) => r.includes("USADA"))).toBe(true);
  });

  it("all returned fields are non-empty strings or arrays", () => {
    const ctx = generateSupportContext("distressed", "dispute_resolution");
    expect(ctx).toBeDefined();
    expect(typeof ctx!.acknowledgment).toBe("string");
    expect(ctx!.acknowledgment.length).toBeGreaterThan(0);
    expect(typeof ctx!.guidance).toBe("string");
    expect(ctx!.guidance.length).toBeGreaterThan(0);
    expect(Array.isArray(ctx!.safetyResources)).toBe(true);
    expect(Array.isArray(ctx!.toneModifiers)).toBe(true);
  });
});
