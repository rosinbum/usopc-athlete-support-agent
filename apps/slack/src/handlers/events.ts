import { createLogger } from "@usopc/shared";
import { handleMessage, type SlackMessageEvent } from "./message.js";
import { handleMention, type SlackMentionEvent } from "./mention.js";

const logger = createLogger({ service: "slack-events" });

interface SlackEventWrapper {
  type: string;
  token?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type: string;
    subtype?: string;
    bot_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Dispatches incoming Slack events to the appropriate handler.
 *
 * Handles:
 * - url_verification (Slack challenge handshake)
 * - event_callback with event.type === "message" (DMs)
 * - event_callback with event.type === "app_mention" (@mentions)
 *
 * @param retryNum - Value of the X-Slack-Retry-Num header (0 if not present).
 *   Slack retries events when the Lambda doesn't acknowledge within 3 seconds.
 *   Retries are dropped immediately to prevent duplicate agent responses.
 */
export async function dispatchEvent(
  payload: SlackEventWrapper,
  retryNum = 0,
): Promise<{ statusCode: number; body: string }> {
  // Drop Slack event retries — the agent already handled the original event.
  if (retryNum > 0) {
    logger.warn("Ignoring Slack event retry", { retryNum });
    return { statusCode: 200, body: "ok" };
  }

  // URL verification challenge
  if (payload.type === "url_verification") {
    logger.info("Handling URL verification challenge");
    return {
      statusCode: 200,
      body: JSON.stringify({ challenge: payload.challenge }),
    };
  }

  if (payload.type !== "event_callback" || !payload.event) {
    logger.warn("Unknown event type", { type: payload.type });
    return { statusCode: 200, body: "ok" };
  }

  const event = payload.event;

  // Ignore bot messages to prevent loops
  if (event.subtype === "bot_message" || event.bot_id) {
    return { statusCode: 200, body: "ok" };
  }

  switch (event.type) {
    case "message":
      await handleMessage(event as unknown as SlackMessageEvent);
      break;

    case "app_mention":
      await handleMention(event as unknown as SlackMentionEvent);
      break;

    default:
      logger.debug("Unhandled event type", { eventType: event.type });
  }

  return { statusCode: 200, body: "ok" };
}
