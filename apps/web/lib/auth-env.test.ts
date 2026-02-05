import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@usopc/shared", () => ({
  getSecretValue: vi.fn(),
}));

import {
  getAuthSecret,
  getGoogleClientId,
  getGoogleClientSecret,
  getAdminEmails,
} from "./auth-env.js";
import { getSecretValue } from "@usopc/shared";

const mockGetSecretValue = vi.mocked(getSecretValue);

describe("auth-env", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAuthSecret", () => {
    it("delegates to getSecretValue with correct params", () => {
      mockGetSecretValue.mockReturnValue("test-secret");
      const result = getAuthSecret();
      expect(mockGetSecretValue).toHaveBeenCalledWith(
        "AUTH_SECRET",
        "AuthSecret",
      );
      expect(result).toBe("test-secret");
    });
  });

  describe("getGoogleClientId", () => {
    it("delegates to getSecretValue with correct params", () => {
      mockGetSecretValue.mockReturnValue("google-id");
      const result = getGoogleClientId();
      expect(mockGetSecretValue).toHaveBeenCalledWith(
        "GOOGLE_CLIENT_ID",
        "GoogleClientId",
      );
      expect(result).toBe("google-id");
    });
  });

  describe("getGoogleClientSecret", () => {
    it("delegates to getSecretValue with correct params", () => {
      mockGetSecretValue.mockReturnValue("google-secret");
      const result = getGoogleClientSecret();
      expect(mockGetSecretValue).toHaveBeenCalledWith(
        "GOOGLE_CLIENT_SECRET",
        "GoogleClientSecret",
      );
      expect(result).toBe("google-secret");
    });
  });

  describe("getAdminEmails", () => {
    it("splits comma-separated emails", () => {
      mockGetSecretValue.mockReturnValue("a@b.com,c@d.com");
      expect(getAdminEmails()).toEqual(["a@b.com", "c@d.com"]);
    });

    it("trims whitespace around emails", () => {
      mockGetSecretValue.mockReturnValue("  a@b.com , c@d.com  ");
      expect(getAdminEmails()).toEqual(["a@b.com", "c@d.com"]);
    });

    it("lowercases emails", () => {
      mockGetSecretValue.mockReturnValue("Admin@Example.COM");
      expect(getAdminEmails()).toEqual(["admin@example.com"]);
    });

    it("filters empty strings from trailing commas", () => {
      mockGetSecretValue.mockReturnValue("a@b.com,,c@d.com,");
      expect(getAdminEmails()).toEqual(["a@b.com", "c@d.com"]);
    });

    it("handles a single email", () => {
      mockGetSecretValue.mockReturnValue("solo@email.com");
      expect(getAdminEmails()).toEqual(["solo@email.com"]);
    });
  });
});
