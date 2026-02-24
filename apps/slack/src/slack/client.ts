import { WebClient } from "@slack/web-api";
import {
  CircuitBreaker,
  getSecretValue,
  logger,
  type CircuitBreakerMetrics,
} from "@usopc/shared";

const log = logger.child({ service: "slack-circuit" });

/**
 * Circuit breaker for Slack API calls.
 *
 * Configuration:
 * - failureThreshold: 5 (higher threshold as Slack is generally reliable)
 * - resetTimeout: 30s
 * - requestTimeout: 10s
 */
const slackCircuit = new CircuitBreaker({
  name: "slack",
  failureThreshold: 5,
  resetTimeout: 30_000,
  requestTimeout: 10_000,
  successThreshold: 2,
  logger: log,
});

let client: WebClient | undefined;

export function getSlackClient(): WebClient {
  if (!client) {
    client = new WebClient(getSecretValue("SLACK_BOT_TOKEN", "SlackBotToken"));
  }
  return client;
}

/** Maximum number of retry attempts for transient Slack API errors. */
const MAX_RETRIES = 2;
/** Base delay in ms for exponential backoff. */
const BASE_DELAY_MS = 500;

/**
 * Returns true if the error is a transient Slack API error that should be retried
 * (rate limit 429 or server error 5xx).
 */
function isTransientError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;

  // @slack/web-api errors expose a `code` string and sometimes a numeric `status`
  const err = error as Record<string, unknown>;

  // Rate-limited
  if (err.code === "slack_webapi_rate_limited_error") return true;

  // HTTP status available on platform errors
  const status =
    typeof err.status === "number"
      ? err.status
      : typeof (err.data as Record<string, unknown> | undefined)?.status ===
          "number"
        ? ((err.data as Record<string, unknown>).status as number)
        : undefined;
  if (status !== undefined && (status === 429 || status >= 500)) return true;

  // Generic network / timeout errors
  if (
    err.code === "ETIMEDOUT" ||
    err.code === "ECONNRESET" ||
    err.code === "ECONNREFUSED" ||
    err.code === "slack_webapi_request_error"
  )
    return true;

  return false;
}

/**
 * Executes an async operation with retry for transient errors.
 * Uses exponential backoff with jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !isTransientError(error)) {
        throw error;
      }

      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 200;
      log.warn("Retrying Slack API call after transient error", {
        attempt: attempt + 1,
        maxRetries,
        delay: Math.round(delay),
        error: error instanceof Error ? error.message : String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but satisfies TypeScript
  throw lastError;
}

/**
 * Posts a message to a Slack channel with circuit breaker protection and retry.
 *
 * @throws {CircuitBreakerError} When the circuit is open
 * @throws The underlying error if posting fails after retries
 */
export async function postMessage(
  channel: string,
  text: string,
  blocks?: unknown[],
  threadTs?: string,
): Promise<void> {
  const slack = getSlackClient();
  await slackCircuit.execute(() =>
    withRetry(async () => {
      await slack.chat.postMessage({
        channel,
        text,
        blocks: blocks as never[],
        ...(threadTs !== undefined ? { thread_ts: threadTs } : {}),
      });
    }),
  );
}

/**
 * Adds a reaction to a message.
 *
 * This is a non-critical operation, so failures are silently ignored.
 * The circuit breaker still protects against cascading failures but
 * uses executeWithFallback to provide graceful degradation.
 */
export async function addReaction(
  channel: string,
  timestamp: string,
  name: string,
): Promise<void> {
  const slack = getSlackClient();
  // Use executeWithFallback since reactions are non-critical
  // Returns undefined on failure (no-op)
  await slackCircuit.executeWithFallback(
    async () => {
      await slack.reactions.add({ channel, timestamp, name });
    },
    undefined, // Silently succeed on failure
  );
}

/**
 * Returns current metrics for the Slack circuit breaker.
 */
export function getSlackCircuitMetrics(): CircuitBreakerMetrics {
  return slackCircuit.getMetrics();
}

/**
 * Resets the Slack circuit breaker to closed state.
 * Useful for testing or manual recovery.
 */
export function resetSlackCircuit(): void {
  slackCircuit.reset();
}
