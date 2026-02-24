import { createLogger } from "@usopc/shared";
import { z } from "zod";
import { handleMessage, type SlackMessageEvent } from "./message.js";
import { handleMention, type SlackMentionEvent } from "./mention.js";

const logger = createLogger({ service: "slack-events" });

// ---------------------------------------------------------------------------
// Payload validation schemas
// ---------------------------------------------------------------------------

const slackMessageEventSchema = z.object({
  type: z.literal("message"),
  channel: z.string(),
  user: z.string(),
  text: z.string(),
  ts: z.string(),
  channel_type: z.string(),
  thread_ts: z.string().optional(),
});

const slackMentionEventSchema = z.object({
  type: z.literal("app_mention"),
  channel: z.string(),
  user: z.string(),
  text: z.string(),
  ts: z.string(),
  thread_ts: z.string().optional(),
});

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
    case "message": {
      const parsed = slackMessageEventSchema.safeParse(event);
      if (!parsed.success) {
        logger.warn("Invalid message event payload", {
          errors: parsed.error.issues.map((i) => i.message),
        });
        return { statusCode: 200, body: "ok" };
      }
      await handleMessage(parsed.data as SlackMessageEvent);
      break;
    }

    case "app_mention": {
      const parsed = slackMentionEventSchema.safeParse(event);
      if (!parsed.success) {
        logger.warn("Invalid mention event payload", {
          errors: parsed.error.issues.map((i) => i.message),
        });
        return { statusCode: 200, body: "ok" };
      }
      await handleMention(parsed.data as SlackMentionEvent);
      break;
    }

    default:
      logger.debug("Unhandled event type", { eventType: event.type });
  }

  return { statusCode: 200, body: "ok" };
}
