import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited, _resetForTesting } from "./rate-limit.js";

describe("isRateLimited", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("allows requests under the per-IP limit", () => {
    for (let i = 0; i < 20; i++) {
      expect(isRateLimited("1.2.3.4")).toBe(false);
    }
  });

  it("blocks requests over the per-IP limit", () => {
    for (let i = 0; i < 20; i++) {
      isRateLimited("1.2.3.4");
    }
    expect(isRateLimited("1.2.3.4")).toBe(true);
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < 20; i++) {
      isRateLimited("1.2.3.4");
    }
    // Different IP should not be limited
    expect(isRateLimited("5.6.7.8")).toBe(false);
    // Original IP should be limited
    expect(isRateLimited("1.2.3.4")).toBe(true);
  });

  it("enforces global limit across all IPs", () => {
    // Spread 100 requests across different IPs (each under per-IP limit of 20)
    for (let i = 0; i < 100; i++) {
      isRateLimited(`10.0.${Math.floor(i / 10)}.${i % 10}`);
    }
    // 101st request from a fresh IP should still be blocked by global limit
    expect(isRateLimited("192.168.1.1")).toBe(true);
  });
});
