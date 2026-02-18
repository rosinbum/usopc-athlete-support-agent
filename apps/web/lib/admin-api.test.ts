import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../auth.js", () => ({
  auth: vi.fn(),
}));

vi.mock("./auth-env.js", () => ({
  getAdminEmails: vi.fn(),
}));

import { requireAdmin } from "./admin-api.js";
import { auth } from "../auth.js";
import { getAdminEmails } from "./auth-env.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = vi.mocked(auth) as any;
const mockGetAdminEmails = vi.mocked(getAdminEmails);

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminEmails.mockReturnValue(["admin@example.com"]);
  });

  it("returns null when session email is in allowlist", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "admin@example.com" },
      expires: "",
    });

    const result = await requireAdmin();
    expect(result).toBeNull();
  });

  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const body = await result!.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no email", async () => {
    mockAuth.mockResolvedValue({
      user: { email: undefined },
      expires: "",
    });

    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 403 when email not in allowlist", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "notadmin@example.com" },
      expires: "",
    });

    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const body = await result!.json();
    expect(body.error).toBe("Forbidden");
  });

  it("performs case-insensitive email comparison", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "Admin@Example.COM" },
      expires: "",
    });

    const result = await requireAdmin();
    expect(result).toBeNull();
  });
});
