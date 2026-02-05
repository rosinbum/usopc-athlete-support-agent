import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@usopc/shared", () => ({
  getSecretValue: vi.fn(),
}));

import {
  getAuthSecret,
  getGitHubClientId,
  getGitHubClientSecret,
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

  describe("getGitHubClientId", () => {
    it("delegates to getSecretValue with correct params", () => {
      mockGetSecretValue.mockReturnValue("github-id");
      const result = getGitHubClientId();
      expect(mockGetSecretValue).toHaveBeenCalledWith(
        "GITHUB_CLIENT_ID",
        "GitHubClientId",
      );
      expect(result).toBe("github-id");
    });
  });

  describe("getGitHubClientSecret", () => {
    it("delegates to getSecretValue with correct params", () => {
      mockGetSecretValue.mockReturnValue("github-secret");
      const result = getGitHubClientSecret();
      expect(mockGetSecretValue).toHaveBeenCalledWith(
        "GITHUB_CLIENT_SECRET",
        "GitHubClientSecret",
      );
      expect(result).toBe("github-secret");
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
