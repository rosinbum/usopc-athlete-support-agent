import { describe, it, expect, vi } from "vitest";

vi.mock("./auth.js", () => ({
  // auth() wraps a handler and returns it — mock that behavior
  auth: vi.fn((handler: unknown) => handler),
}));

import middleware, { config } from "./middleware.js";

describe("middleware", () => {
  it("exports a middleware function", () => {
    expect(typeof middleware).toBe("function");
  });

  it("matches admin pages", () => {
    expect(config.matcher).toContain("/admin/:path*");
  });

  it("matches admin API routes", () => {
    expect(config.matcher).toContain("/api/admin/:path*");
  });

  it("matches chat routes", () => {
    expect(config.matcher).toContain("/chat/:path*");
  });

  it("matches chat API route", () => {
    expect(config.matcher).toContain("/api/chat/:path*");
  });
});
