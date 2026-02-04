import { WebClient } from "@slack/web-api";
import {
  CircuitBreaker,
  getRequiredEnv,
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
    client = new WebClient(getRequiredEnv("SLACK_BOT_TOKEN"));
  }
  return client;
}

/**
 * Posts a message to a Slack channel with circuit breaker protection.
 *
 * @throws {CircuitBreakerError} When the circuit is open
 * @throws The underlying error if posting fails
 */
export async function postMessage(
  channel: string,
  text: string,
  blocks?: unknown[],
  threadTs?: string,
): Promise<void> {
  const slack = getSlackClient();
  await slackCircuit.execute(async () => {
    await slack.chat.postMessage({
      channel,
      text,
      blocks: blocks as never[],
      thread_ts: threadTs,
    });
  });
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
