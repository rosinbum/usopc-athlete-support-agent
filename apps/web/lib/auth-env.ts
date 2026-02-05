import { getSecretValue } from "@usopc/shared";

export function getAuthSecret(): string {
  return getSecretValue("AUTH_SECRET", "AuthSecret");
}

export function getGitHubClientId(): string {
  return getSecretValue("GITHUB_CLIENT_ID", "GitHubClientId");
}

export function getGitHubClientSecret(): string {
  return getSecretValue("GITHUB_CLIENT_SECRET", "GitHubClientSecret");
}

export function getAdminEmails(): string[] {
  const raw = getSecretValue("ADMIN_EMAILS", "AdminEmails");
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
