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
vi.mock("../../../../lib/send-invite-email.js", () => ({
  sendInviteEmail: vi.fn(),
}));

import { auth } from "../../../../auth.js";
import { createInviteEntity } from "@usopc/shared";
import { sendInviteEmail } from "../../../../lib/send-invite-email.js";
import { GET, POST, DELETE, PATCH } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateInviteEntity = vi.mocked(createInviteEntity);
const mockSendInviteEmail = vi.mocked(sendInviteEmail);

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
    user: { email: "admin@test.com", name: "Admin", role: "admin" as const },
  } as never);
}

// ---------------------------------------------------------------------------
// Tests — error detail leakage
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

// ---------------------------------------------------------------------------
// Tests — POST email sending
// ---------------------------------------------------------------------------

describe("admin invites route — POST email sending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST success calls sendInviteEmail with normalized email and invitedBy", async () => {
    authedAdmin();
    const mockInvite = { email: "athlete@example.com", invitedBy: "Admin" };
    mockCreateInviteEntity.mockReturnValueOnce({
      create: vi.fn().mockResolvedValueOnce(mockInvite),
    } as never);
    mockSendInviteEmail.mockResolvedValueOnce(true);

    const res = await POST(
      jsonRequest("POST", { email: "Athlete@Example.COM" }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.emailSent).toBe(true);
    expect(mockSendInviteEmail).toHaveBeenCalledWith(
      "athlete@example.com",
      "Admin",
    );
  });

  it("POST returns 201 with emailSent: false when email fails", async () => {
    authedAdmin();
    const mockInvite = { email: "athlete@example.com" };
    mockCreateInviteEntity.mockReturnValueOnce({
      create: vi.fn().mockResolvedValueOnce(mockInvite),
    } as never);
    mockSendInviteEmail.mockResolvedValueOnce(false);

    const res = await POST(
      jsonRequest("POST", { email: "athlete@example.com" }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.emailSent).toBe(false);
    expect(body.invite).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — PATCH resend email
// ---------------------------------------------------------------------------

describe("admin invites route — PATCH resend email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PATCH success calls sendInviteEmail and returns emailSent: true", async () => {
    authedAdmin();
    mockSendInviteEmail.mockResolvedValueOnce(true);

    const res = await PATCH(
      jsonRequest("PATCH", { email: "athlete@example.com" }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.emailSent).toBe(true);
    expect(mockSendInviteEmail).toHaveBeenCalledWith(
      "athlete@example.com",
      "Admin",
    );
  });

  it("PATCH returns 400 for invalid email", async () => {
    authedAdmin();

    const res = await PATCH(
      jsonRequest("PATCH", { email: "not-an-email" }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("PATCH requires admin auth", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await PATCH(
      jsonRequest("PATCH", { email: "athlete@example.com" }) as never,
    );

    expect(res.status).toBe(401);
  });
});
