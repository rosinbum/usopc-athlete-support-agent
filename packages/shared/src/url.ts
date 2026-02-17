import { createHash } from "node:crypto";

/**
 * Normalizes a URL for deduplication:
 * - Strips fragment (#...)
 * - Strips trailing slash
 * - Strips www. prefix from host
 */
export function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    // Strip www. prefix
    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    let normalized = parsed.toString();
    // Strip trailing slash (but not for root "/")
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    // If URL parsing fails, return as-is
    return raw;
  }
}

/**
 * Generates a deterministic SHA-256 ID from a normalized URL.
 */
export function urlToId(normalizedUrl: string): string {
  return createHash("sha256").update(normalizedUrl).digest("hex");
}
