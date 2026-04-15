import { getSecretValue } from "@usopc/shared";
import { z } from "zod";

export function getAuthSecret(): string {
  return getSecretValue("AUTH_SECRET");
}

export function getGitHubClientId(): string {
  return getSecretValue("GITHUB_CLIENT_ID");
}

export function getGitHubClientSecret(): string {
  return getSecretValue("GITHUB_CLIENT_SECRET");
}

const emailListSchema = z.array(
  z.string().email("Invalid email in ADMIN_EMAILS"),
);

export function getAdminEmails(): string[] {
  const raw = getSecretValue("ADMIN_EMAILS");
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emailListSchema.parse(emails);
}

export function getResendApiKey(): string {
  return getSecretValue("RESEND_API_KEY");
}
