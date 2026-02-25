import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../auth.js", () => ({
  auth: vi.fn(),
}));
vi.mock("../../../../lib/auth-env.js", () => ({
  getAdminEmails: vi.fn(() => ["admin@test.com"]),
}));
vi.mock("@usopc/shared", () => ({
  createInviteEntity: vi.fn(),
  logger: {
    child: vi.fn(() => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

import { auth } from "../../../../auth.js";
import { createInviteEntity } from "@usopc/shared";
import { GET, POST, DELETE } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateInviteEntity = vi.mocked(createInviteEntity);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/admin/invites", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function authedAdmin() {
  mockAuth.mockResolvedValueOnce({
    user: { email: "admin@test.com", role: "admin" as const },
  } as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("admin invites route — error detail leakage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET 500 does not leak error details", async () => {
    authedAdmin();
    mockCreateInviteEntity.mockReturnValueOnce({
      getAll: vi.fn().mockRejectedValueOnce(new Error("DB connection lost")),
    } as never);

    const res = await GET(jsonRequest("GET") as never);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to fetch invites");
    expect(body).not.toHaveProperty("detail");
  });

  it("POST 500 does not leak error details", async () => {
    authedAdmin();
    mockCreateInviteEntity.mockReturnValueOnce({
      create: vi.fn().mockRejectedValueOnce(new Error("DynamoDB timeout")),
    } as never);

    const res = await POST(
      jsonRequest("POST", {
        email: "test@example.com",
      }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to create invite");
    expect(body).not.toHaveProperty("detail");
  });

  it("DELETE 500 does not leak error details", async () => {
    authedAdmin();
    mockCreateInviteEntity.mockReturnValueOnce({
      delete: vi
        .fn()
        .mockRejectedValueOnce(new Error("Conditional check failed")),
    } as never);

    const res = await DELETE(
      jsonRequest("DELETE", { email: "test@example.com" }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to delete invite");
    expect(body).not.toHaveProperty("detail");
  });
});
