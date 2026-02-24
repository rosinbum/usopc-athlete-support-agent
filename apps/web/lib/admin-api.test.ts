import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../auth.js", () => ({
  auth: vi.fn(),
}));

import { requireAdmin } from "./admin-api.js";
import { auth } from "../auth.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = vi.mocked(auth) as any;

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when session has admin role", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "admin@example.com", role: "admin" },
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

  it("returns 403 when session role is athlete", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "athlete@example.com", role: "athlete" },
      expires: "",
    });

    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const body = await result!.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when session has no role", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "someone@example.com" },
      expires: "",
    });

    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});
