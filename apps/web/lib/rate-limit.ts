/**
 * Simple in-memory fixed-window rate limiter.
 *
 * Tracks request counts per IP within a sliding window. Each Lambda instance
 * maintains its own state, so the effective limit scales with concurrency.
 * For stronger protection, add an AWS WAF rate rule in front of the ALB/API GW.
 */

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS = 100;
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipCounts = new Map<string, RateLimitEntry>();
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

/**
 * Returns `true` if the given IP has exceeded the rate limit.
 * Call once per request; increments the counter as a side effect.
 */
export function isRateLimited(ip: string): boolean {
  cleanup();
  const now = Date.now();
  const entry = ipCounts.get(ip);

  if (!entry || now >= entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > MAX_REQUESTS;
}

/** Reset all state — test helper only. */
export function _resetForTesting() {
  ipCounts.clear();
  lastCleanup = Date.now();
}
