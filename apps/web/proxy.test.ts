import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted: capture the handler function passed to auth()
// ---------------------------------------------------------------------------
const { capturedHandler } = vi.hoisted(() => ({
  capturedHandler: {
    current: null as ((req: unknown) => unknown) | null,
  },
}));

vi.mock("./auth.js", () => ({
  auth: vi.fn((handler: (req: unknown) => unknown) => {
    capturedHandler.current = handler;
    return handler;
  }),
}));

import { config } from "./proxy.js";

// ---------------------------------------------------------------------------
// Helper: create a fake request with auth session
// ---------------------------------------------------------------------------
function makeRequest(
  pathname: string,
  session: { user?: { role?: string } } | null,
) {
  return {
    nextUrl: { pathname },
    url: "http://localhost:3000" + pathname,
    auth: session,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("route matcher config", () => {
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

  describe("authorization behavior (TEST-03)", () => {
    it("redirects unauthenticated users to /auth/login", () => {
      const result = capturedHandler.current!(
        makeRequest("/chat/abc", null),
      ) as NextResponse;
      expect(result.status).toBe(307);
      const location = result.headers.get("location");
      expect(location).toContain("/auth/login");
      expect(location).toContain("callbackUrl=%2Fchat%2Fabc");
    });

    it("includes callbackUrl for admin routes", () => {
      const result = capturedHandler.current!(
        makeRequest("/admin/sources", null),
      ) as NextResponse;
      expect(result.status).toBe(307);
      const location = result.headers.get("location");
      expect(location).toContain("callbackUrl=%2Fadmin%2Fsources");
    });

    it("redirects non-admin users from /admin routes", () => {
      const result = capturedHandler.current!(
        makeRequest("/admin/sources", { user: { role: "athlete" } }),
      ) as NextResponse;
      expect(result.status).toBe(307);
      const location = result.headers.get("location");
      expect(location).toContain("error=AccessDenied");
    });

    it("redirects non-admin users from /api/admin routes", () => {
      const result = capturedHandler.current!(
        makeRequest("/api/admin/sources", { user: { role: "athlete" } }),
      ) as NextResponse;
      expect(result.status).toBe(307);
      const location = result.headers.get("location");
      expect(location).toContain("error=AccessDenied");
    });

    it("allows admin users to access /admin routes", () => {
      const result = capturedHandler.current!(
        makeRequest("/admin/sources", { user: { role: "admin" } }),
      ) as NextResponse;
      expect(result.headers.get("location")).toBeNull();
    });

    it("allows admin users to access /api/admin routes", () => {
      const result = capturedHandler.current!(
        makeRequest("/api/admin/invites", { user: { role: "admin" } }),
      ) as NextResponse;
      expect(result.headers.get("location")).toBeNull();
    });

    it("allows authenticated non-admin users to access /chat routes", () => {
      const result = capturedHandler.current!(
        makeRequest("/chat/abc", { user: { role: "athlete" } }),
      ) as NextResponse;
      expect(result.headers.get("location")).toBeNull();
    });

    it("allows authenticated non-admin users to access /api/chat routes", () => {
      const result = capturedHandler.current!(
        makeRequest("/api/chat", { user: { role: "athlete" } }),
      ) as NextResponse;
      expect(result.headers.get("location")).toBeNull();
    });
  });
});
