import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockGetAdminEmails, mockIsInvited, capturedCallbacks } = vi.hoisted(
  () => ({
    mockGetAdminEmails: vi.fn().mockReturnValue(["admin@usopc.org"]),
    mockIsInvited: vi.fn().mockResolvedValue(true),
    capturedCallbacks: {
      signIn: null as ((...args: unknown[]) => unknown) | null,
      jwt: null as ((...args: unknown[]) => unknown) | null,
      session: null as ((...args: unknown[]) => unknown) | null,
      authorized: null as ((...args: unknown[]) => unknown) | null,
    },
  }),
);

vi.mock("@usopc/shared", () => ({
  createInviteEntity: vi.fn(() => ({ isInvited: mockIsInvited })),
  getResource: vi.fn(() => ({ name: "AuthTable" })),
  getSecretValue: vi.fn(() => "test-secret"),
}));

vi.mock("./lib/auth-env.js", () => ({
  getAuthSecret: vi.fn(() => "test-secret"),
  getGitHubClientId: vi.fn(() => "test-client-id"),
  getGitHubClientSecret: vi.fn(() => "test-client-secret"),
  getAdminEmails: mockGetAdminEmails,
  getResendApiKey: vi.fn(() => "test-resend-key"),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDB: vi.fn(),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocument: { from: vi.fn(() => ({})) },
}));

vi.mock("@auth/dynamodb-adapter", () => ({
  DynamoDBAdapter: vi.fn(() => ({})),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(
    (config: {
      callbacks: {
        signIn: (...args: unknown[]) => unknown;
        jwt: (...args: unknown[]) => unknown;
        session: (...args: unknown[]) => unknown;
        authorized: (...args: unknown[]) => unknown;
      };
    }) => {
      capturedCallbacks.signIn = config.callbacks.signIn;
      capturedCallbacks.jwt = config.callbacks.jwt;
      capturedCallbacks.session = config.callbacks.session;
      capturedCallbacks.authorized = config.callbacks.authorized;
      return {
        handlers: {},
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      };
    },
  ),
}));

vi.mock("next-auth/providers/github", () => ({
  default: vi.fn(() => ({ id: "github", name: "GitHub" })),
}));

vi.mock("next-auth/providers/resend", () => ({
  default: vi.fn(() => ({ id: "resend", name: "Resend" })),
}));

// ---------------------------------------------------------------------------
// Import triggers NextAuth() and captures callbacks
// ---------------------------------------------------------------------------
await import("./auth.js");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminEmails.mockReturnValue(["admin@usopc.org"]);
  mockIsInvited.mockResolvedValue(true);
});

describe("NextAuth callbacks", () => {
  describe("signIn callback (TEST-01)", () => {
    it("rejects users with no email", async () => {
      const result = await capturedCallbacks.signIn!({
        profile: {},
        user: {},
        account: { provider: "github" },
      });
      expect(result).toBe(false);
    });

    it("allows GitHub users on admin allowlist", async () => {
      const result = await capturedCallbacks.signIn!({
        profile: { email: "admin@usopc.org" },
        user: {},
        account: { provider: "github" },
      });
      expect(result).toBe(true);
    });

    it("rejects GitHub users not on admin allowlist", async () => {
      const result = await capturedCallbacks.signIn!({
        profile: { email: "hacker@evil.com" },
        user: {},
        account: { provider: "github" },
      });
      expect(result).toBe(false);
    });

    it("allows Resend users on invite list", async () => {
      mockIsInvited.mockResolvedValue(true);
      const result = await capturedCallbacks.signIn!({
        profile: {},
        user: { email: "athlete@example.com" },
        account: { provider: "resend" },
      });
      expect(result).toBe(true);
      expect(mockIsInvited).toHaveBeenCalledWith("athlete@example.com");
    });

    it("rejects Resend users not on invite list", async () => {
      mockIsInvited.mockResolvedValue(false);
      const result = await capturedCallbacks.signIn!({
        profile: {},
        user: { email: "uninvited@example.com" },
        account: { provider: "resend" },
      });
      expect(result).toBe(false);
    });

    it("rejects unknown providers", async () => {
      const result = await capturedCallbacks.signIn!({
        profile: { email: "user@example.com" },
        user: {},
        account: { provider: "twitter" },
      });
      expect(result).toBe(false);
    });

    it("is case-insensitive for email matching", async () => {
      const result = await capturedCallbacks.signIn!({
        profile: { email: "ADMIN@USOPC.ORG" },
        user: {},
        account: { provider: "github" },
      });
      expect(result).toBe(true);
    });
  });

  describe("jwt callback — role re-evaluation (TEST-01, SEC-05)", () => {
    it("assigns admin role for GitHub user on allowlist", async () => {
      const token = (await capturedCallbacks.jwt!({
        token: { email: "admin@usopc.org", provider: "github" },
        profile: null,
        user: null,
        account: null,
      })) as Record<string, unknown>;
      expect(token.role).toBe("admin");
    });

    it("demotes removed admin to athlete on next token refresh", async () => {
      // First call: admin is on list
      mockGetAdminEmails.mockReturnValue(["admin@usopc.org"]);
      const token1 = (await capturedCallbacks.jwt!({
        token: { email: "admin@usopc.org", provider: "github" },
        profile: null,
        user: null,
        account: null,
      })) as Record<string, unknown>;
      expect(token1.role).toBe("admin");

      // Second call: admin removed from list
      mockGetAdminEmails.mockReturnValue([]);
      const token2 = (await capturedCallbacks.jwt!({
        token: { email: "admin@usopc.org", provider: "github" },
        profile: null,
        user: null,
        account: null,
      })) as Record<string, unknown>;
      expect(token2.role).toBe("athlete");
    });

    it("assigns athlete role for Resend provider", async () => {
      const token = (await capturedCallbacks.jwt!({
        token: { email: "athlete@example.com", provider: "resend" },
        profile: null,
        user: null,
        account: null,
      })) as Record<string, unknown>;
      expect(token.role).toBe("athlete");
    });

    it("sets provider from account on initial sign-in", async () => {
      const token = (await capturedCallbacks.jwt!({
        token: {},
        profile: { email: "admin@usopc.org", name: "Admin" },
        user: null,
        account: { provider: "github" },
      })) as Record<string, unknown>;
      expect(token.provider).toBe("github");
    });

    it("populates email from user object for email provider", async () => {
      const token = (await capturedCallbacks.jwt!({
        token: { provider: "resend" },
        profile: null,
        user: { email: "athlete@example.com", name: null },
        account: null,
      })) as Record<string, unknown>;
      expect(token.email).toBe("athlete@example.com");
    });
  });

  describe("session callback (TEST-01)", () => {
    it("propagates role from token to session", async () => {
      const session = (await capturedCallbacks.session!({
        session: { user: { email: "", name: "", image: "" } },
        token: {
          email: "admin@usopc.org",
          name: "Admin",
          picture: "https://avatar.url",
          role: "admin",
        },
      })) as { user: Record<string, unknown> };
      expect(session.user.role).toBe("admin");
      expect(session.user.email).toBe("admin@usopc.org");
      expect(session.user.name).toBe("Admin");
      expect(session.user.image).toBe("https://avatar.url");
    });

    it("does not set role when token has no role", async () => {
      const session = (await capturedCallbacks.session!({
        session: { user: { email: "" } },
        token: { email: "user@example.com" },
      })) as { user: Record<string, unknown> };
      expect(session.user.role).toBeUndefined();
    });
  });
});
