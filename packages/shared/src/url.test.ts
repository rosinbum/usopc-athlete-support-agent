import { describe, it, expect } from "vitest";
import { normalizeUrl, urlToId } from "./url.js";

describe("normalizeUrl", () => {
  it("strips fragment", () => {
    expect(normalizeUrl("https://usopc.org/page#section")).toBe(
      "https://usopc.org/page",
    );
  });

  it("strips trailing slash on paths", () => {
    expect(normalizeUrl("https://usopc.org/page/")).toBe(
      "https://usopc.org/page",
    );
  });

  it("preserves root path trailing slash", () => {
    expect(normalizeUrl("https://usopc.org/")).toBe("https://usopc.org/");
  });

  it("strips www. prefix", () => {
    expect(normalizeUrl("https://www.usopc.org/page")).toBe(
      "https://usopc.org/page",
    );
  });

  it("handles all normalizations together", () => {
    expect(normalizeUrl("https://www.usopc.org/page/#section")).toBe(
      "https://usopc.org/page",
    );
  });

  it("returns invalid URLs as-is", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("urlToId", () => {
  it("returns a deterministic hash", () => {
    const id1 = urlToId("https://usopc.org/page");
    const id2 = urlToId("https://usopc.org/page");
    expect(id1).toBe(id2);
  });

  it("returns a 64-char hex string (SHA-256)", () => {
    const id = urlToId("https://usopc.org/page");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different URLs produce different IDs", () => {
    const id1 = urlToId("https://usopc.org/page-a");
    const id2 = urlToId("https://usopc.org/page-b");
    expect(id1).not.toBe(id2);
  });
});
