import { describe, it, expect, vi } from "vitest";

vi.mock("./auth.js", () => ({
  auth: vi.fn(),
}));

import { config, middleware } from "./middleware.js";

describe("middleware", () => {
  it("exports a middleware function", () => {
    expect(middleware).toBeDefined();
  });

  it("matches admin pages", () => {
    expect(config.matcher).toContain("/admin/:path*");
  });

  it("matches admin API routes", () => {
    expect(config.matcher).toContain("/api/admin/:path*");
  });
});
