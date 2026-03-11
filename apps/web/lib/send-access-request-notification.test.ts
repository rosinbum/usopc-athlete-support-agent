import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "mock-id" }) },
  })),
}));

vi.mock("./auth-env.js", () => ({
  getResendApiKey: vi.fn().mockReturnValue("re_test_key"),
}));

vi.mock("@usopc/shared", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn() }) },
}));

import { Resend } from "resend";
import { sendAccessRequestNotification } from "./send-access-request-notification.js";

const mockSend = vi.fn().mockResolvedValue({ id: "mock-id" });

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ id: "mock-id" });
  vi.mocked(Resend).mockImplementation(
    () => ({ emails: { send: mockSend } }) as unknown as Resend,
  );
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.EMAIL_FROM = "test@example.com";
});

function lastSendArgs() {
  return mockSend.mock.calls[0]![0] as { html: string; subject: string };
}

function makeRequest(overrides = {}) {
  return {
    email: "user@example.com",
    name: "Jane Doe",
    status: "pending" as const,
    requestedAt: "2026-03-10T00:00:00Z",
    ...overrides,
  };
}

describe("sendAccessRequestNotification", () => {
  describe("HTML escaping", () => {
    it("escapes HTML entities in name", async () => {
      await sendAccessRequestNotification(
        makeRequest({ name: '<img src=x onerror="alert(1)">' }),
      );

      const html = lastSendArgs().html;
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
      expect(html).toContain("&gt;");
    });

    it("escapes HTML entities in email field", async () => {
      await sendAccessRequestNotification(
        makeRequest({ email: '<script>alert("xss")</script>' }),
      );

      const html = lastSendArgs().html;
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes HTML entities in sport", async () => {
      await sendAccessRequestNotification(
        makeRequest({ sport: '"><script>alert(1)</script>' }),
      );

      const html = lastSendArgs().html;
      expect(html).not.toContain("<script>");
      expect(html).toContain("&quot;&gt;&lt;script&gt;");
    });

    it("escapes HTML entities in role", async () => {
      await sendAccessRequestNotification(
        makeRequest({ role: "<b>admin</b>" }),
      );

      const html = lastSendArgs().html;
      expect(html).not.toContain("<b>");
      expect(html).toContain("&lt;b&gt;");
    });

    it("escapes ampersands and single quotes", async () => {
      await sendAccessRequestNotification(
        makeRequest({ name: "O'Brien & Co" }),
      );

      const html = lastSendArgs().html;
      expect(html).toContain("O&#39;Brien &amp; Co");
    });
  });

  describe("subject line sanitization", () => {
    it("strips CRLF from name in subject", async () => {
      await sendAccessRequestNotification(
        makeRequest({ name: "Evil\r\nBcc: victim@evil.com" }),
      );

      const subject = lastSendArgs().subject;
      expect(subject).not.toContain("\r");
      expect(subject).not.toContain("\n");
      expect(subject).toContain("EvilBcc: victim@evil.com");
    });

    it("strips CRLF from email in subject", async () => {
      await sendAccessRequestNotification(
        makeRequest({ email: "user@test.com\r\nBcc: spy@evil.com" }),
      );

      const subject = lastSendArgs().subject;
      expect(subject).not.toContain("\r");
      expect(subject).not.toContain("\n");
    });
  });

  describe("basic functionality", () => {
    it("returns false when ADMIN_EMAIL is not set", async () => {
      delete process.env.ADMIN_EMAIL;
      const result = await sendAccessRequestNotification(makeRequest());
      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("returns true on success", async () => {
      const result = await sendAccessRequestNotification(makeRequest());
      expect(result).toBe(true);
    });

    it("returns false on send failure", async () => {
      mockSend.mockRejectedValueOnce(new Error("send failed"));
      const result = await sendAccessRequestNotification(makeRequest());
      expect(result).toBe(false);
    });
  });
});
