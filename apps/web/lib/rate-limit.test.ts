import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited, _resetForTesting } from "./rate-limit.js";

describe("isRateLimited", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("allows requests under the limit", () => {
    for (let i = 0; i < 100; i++) {
      expect(isRateLimited("1.2.3.4")).toBe(false);
    }
  });

  it("blocks requests over the limit", () => {
    for (let i = 0; i < 100; i++) {
      isRateLimited("1.2.3.4");
    }
    expect(isRateLimited("1.2.3.4")).toBe(true);
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < 100; i++) {
      isRateLimited("1.2.3.4");
    }
    // Different IP should not be limited
    expect(isRateLimited("5.6.7.8")).toBe(false);
    // Original IP should be limited
    expect(isRateLimited("1.2.3.4")).toBe(true);
  });
});
