import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSend = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: { send: mockSend },
  })),
}));

vi.mock("./auth-env.js", () => ({
  getResendApiKey: vi.fn(() => "re_test_key"),
}));

vi.mock("@usopc/shared", () => ({
  logger: {
    child: vi.fn(() => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

import { sendInviteEmail } from "./send-invite-email.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendInviteEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_URL = "https://test.example.com";
    process.env.EMAIL_FROM = "Test <noreply@test.example.com>";
  });

  it("returns true on successful send", async () => {
    mockSend.mockResolvedValueOnce({ id: "email_123" });

    const result = await sendInviteEmail("athlete@example.com", "Admin User");

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0]![0];
    expect(call.from).toBe("Test <noreply@test.example.com>");
    expect(call.to).toBe("athlete@example.com");
    expect(call.subject).toBe("You've been invited to USOPC Athlete Support");
    expect(call.html).toContain("Admin User");
  });

  it("returns false on Resend API error without throwing", async () => {
    mockSend.mockRejectedValueOnce(new Error("Resend API error"));

    const result = await sendInviteEmail("athlete@example.com");

    expect(result).toBe(false);
  });

  it("includes invitedBy in HTML when provided", async () => {
    mockSend.mockResolvedValueOnce({ id: "email_456" });

    await sendInviteEmail("athlete@example.com", "Coach Smith");

    const html = mockSend.mock.calls[0]![0].html as string;
    expect(html).toContain("Coach Smith");
  });

  it("omits invitedBy from HTML when not provided", async () => {
    mockSend.mockResolvedValueOnce({ id: "email_789" });

    await sendInviteEmail("athlete@example.com");

    const html = mockSend.mock.calls[0]![0].html as string;
    expect(html).not.toContain(" by <strong>");
  });

  it("includes sign-in link using APP_URL", async () => {
    mockSend.mockResolvedValueOnce({ id: "email_abc" });

    await sendInviteEmail("athlete@example.com");

    const html = mockSend.mock.calls[0]![0].html as string;
    expect(html).toContain("https://test.example.com/auth/login");
  });
});
