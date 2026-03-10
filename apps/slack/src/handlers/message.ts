import { createLogger } from "@usopc/shared";
import { detectInjection, INJECTION_RESPONSE } from "@usopc/core";
import { postMessage, addReaction } from "../slack/client.js";
import { isUserInvited } from "../lib/inviteGuard.js";
import { processQuery } from "./processQuery.js";

const logger = createLogger({ service: "slack-message" });

export interface SlackMessageEvent {
  type: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
  channel_type: string;
  thread_ts?: string;
}

/**
 * Handles direct messages to the bot.
 * Only responds to DMs (channel_type === "im") that are not from bots.
 */
export async function handleMessage(event: SlackMessageEvent): Promise<void> {
  // Only handle DMs
  if (event.channel_type !== "im") return;

  const { channel, text, ts, user, thread_ts } = event;
  if (!text || !text.trim()) return;

  logger.info("Handling DM", { user, channel });

  // Check invite list before processing
  const invited = await isUserInvited(user);
  if (!invited) {
    logger.info("User not on invite list, denying access", { user });
    await postMessage(
      channel,
      "Sorry, you don't have access to this service. Please contact your USOPC representative to request an invite.",
      undefined,
      thread_ts ?? ts,
    );
    return;
  }

  // SEC-18: Check for prompt injection patterns
  if (detectInjection(text)) {
    await postMessage(channel, INJECTION_RESPONSE, undefined, thread_ts ?? ts);
    return;
  }

  // Add a reaction to acknowledge receipt
  await addReaction(channel, ts, "eyes");

  const replyTs = thread_ts ?? ts;

  // Process asynchronously — return immediately so Slack gets a fast 200
  processQuery({
    text: text.trim(),
    channel,
    user,
    replyTs,
    conversationId: replyTs,
    logger,
  }).catch((error) => {
    logger.error("Async message processing failed", {
      error: error instanceof Error ? error.message : String(error),
      user,
      channel,
    });
  });
}
