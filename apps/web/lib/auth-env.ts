import { getSecretValue } from "@usopc/shared";

export function getAuthSecret(): string {
  return getSecretValue("AUTH_SECRET", "AuthSecret");
}

export function getGoogleClientId(): string {
  return getSecretValue("GOOGLE_CLIENT_ID", "GoogleClientId");
}

export function getGoogleClientSecret(): string {
  return getSecretValue("GOOGLE_CLIENT_SECRET", "GoogleClientSecret");
}

export function getAdminEmails(): string[] {
  const raw = getSecretValue("ADMIN_EMAILS", "AdminEmails");
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
