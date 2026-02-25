/**
 * Simple in-memory fixed-window rate limiter with per-IP and global caps.
 *
 * Each Lambda instance maintains its own state, so effective limits scale
 * with concurrency. For stronger protection, add an AWS WAF rate rule.
 *
 * TODO: Replace with AWS WAF rate-based rules for production-grade
 * protection that works across all Lambda instances (#393).
 */

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_IP = 20; // ~1 message every 15 seconds
const MAX_REQUESTS_GLOBAL = 100;
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipCounts = new Map<string, RateLimitEntry>();
let globalEntry: RateLimitEntry = { count: 0, resetAt: Date.now() + WINDOW_MS };
let lastCleanup = Date.now();

/** Remove expired entries to prevent unbounded Map growth. */
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [ip, entry] of ipCounts) {
    if (now >= entry.resetAt) {
      ipCounts.delete(ip);
    }
  }
}

function incrementGlobal(): boolean {
  const now = Date.now();
  if (now >= globalEntry.resetAt) {
    globalEntry = { count: 1, resetAt: now + WINDOW_MS };
    return false;
  }
  globalEntry.count++;
  return globalEntry.count > MAX_REQUESTS_GLOBAL;
}

/**
 * Returns `true` if the request should be rejected.
 * Checks both per-IP limit (20 req/5min) and global limit (100 req/5min).
 */
export function isRateLimited(ip: string): boolean {
  cleanup();

  // Check global limit first
  if (incrementGlobal()) return true;

  // Then check per-IP limit
  const now = Date.now();
  const entry = ipCounts.get(ip);

  if (!entry || now >= entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > MAX_REQUESTS_PER_IP;
}

/** Reset all state — test helper only. */
export function _resetForTesting() {
  ipCounts.clear();
  globalEntry = { count: 0, resetAt: Date.now() + WINDOW_MS };
  lastCleanup = Date.now();
}
