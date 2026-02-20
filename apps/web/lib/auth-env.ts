import { getSecretValue } from "@usopc/shared";
import { z } from "zod";

export function getAuthSecret(): string {
  return getSecretValue("AUTH_SECRET", "AuthSecret");
}

export function getGitHubClientId(): string {
  return getSecretValue("GITHUB_CLIENT_ID", "GitHubClientId");
}

export function getGitHubClientSecret(): string {
  return getSecretValue("GITHUB_CLIENT_SECRET", "GitHubClientSecret");
}

const emailListSchema = z.array(
  z.string().email("Invalid email in ADMIN_EMAILS"),
);

export function getAdminEmails(): string[] {
  const raw = getSecretValue("ADMIN_EMAILS", "AdminEmails");
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emailListSchema.parse(emails);
}
