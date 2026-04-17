import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@auth/core", () => ({
  Auth: vi.fn(),
}));

vi.mock("./auth.js", () => ({
  authConfig: { basePath: "/api/auth" },
}));

import { Auth } from "@auth/core";

const mockAuth = vi.mocked(Auth);

function makeRequest(cookie = "session=abc") {
  return new Request("https://example.com/some/page", {
    headers: { cookie },
  });
}

describe("session", () => {
  const originalRequireAuth = process.env.REQUIRE_AUTH;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    if (originalRequireAuth === undefined) {
      delete process.env.REQUIRE_AUTH;
    } else {
      process.env.REQUIRE_AUTH = originalRequireAuth;
    }
  });

  describe("getAdminSession", () => {
    it("returns null when Auth returns non-200, even with REQUIRE_AUTH=false", async () => {
      process.env.REQUIRE_AUTH = "false";
      mockAuth.mockResolvedValue(
        new Response(null, { status: 401 }) as unknown as Response,
      );

      const { getAdminSession } = await import("./session.js");
      const result = await getAdminSession(makeRequest());

      expect(result).toBeNull();
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });

    it("returns the parsed session when Auth returns 200 JSON", async () => {
      process.env.REQUIRE_AUTH = "false";
      const session = {
        user: { email: "admin@example.com", role: "admin" },
      };
      mockAuth.mockResolvedValue(
        new Response(JSON.stringify(session), {
          status: 200,
          headers: { "content-type": "application/json" },
        }) as unknown as Response,
      );

      const { getAdminSession } = await import("./session.js");
      const result = await getAdminSession(makeRequest());

      expect(result).toEqual(session);
    });

    it("returns null when Auth returns an empty object", async () => {
      process.env.REQUIRE_AUTH = "false";
      mockAuth.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }) as unknown as Response,
      );

      const { getAdminSession } = await import("./session.js");
      const result = await getAdminSession(makeRequest());

      expect(result).toBeNull();
    });

    it("forwards the cookie header to @auth/core", async () => {
      process.env.REQUIRE_AUTH = "true";
      mockAuth.mockResolvedValue(
        new Response(null, { status: 401 }) as unknown as Response,
      );

      const { getAdminSession } = await import("./session.js");
      await getAdminSession(makeRequest("my-cookie=xyz"));

      const forwarded = mockAuth.mock.calls[0]?.[0] as Request;
      expect(forwarded.headers.get("cookie")).toBe("my-cookie=xyz");
    });
  });

  describe("getSession", () => {
    it("returns ANONYMOUS_SESSION when REQUIRE_AUTH !== 'true'", async () => {
      process.env.REQUIRE_AUTH = "false";

      const { getSession } = await import("./session.js");
      const result = await getSession(makeRequest());

      expect(result).toEqual({
        user: {
          email: "anonymous@local",
          name: "Anonymous",
          role: "athlete",
        },
      });
      expect(mockAuth).not.toHaveBeenCalled();
    });

    it("hits @auth/core when REQUIRE_AUTH === 'true'", async () => {
      process.env.REQUIRE_AUTH = "true";
      mockAuth.mockResolvedValue(
        new Response(null, { status: 401 }) as unknown as Response,
      );

      const { getSession } = await import("./session.js");
      const result = await getSession(makeRequest());

      expect(result).toBeNull();
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });
  });
});
