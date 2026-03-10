import { createLogger } from "@usopc/shared";
import { detectInjection, INJECTION_RESPONSE } from "@usopc/core";
import { postMessage, addReaction } from "../slack/client.js";
import { isUserInvited } from "../lib/inviteGuard.js";
import { processQuery } from "./processQuery.js";

const logger = createLogger({ service: "slack-mention" });

export interface SlackMentionEvent {
  type: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
}

/**
 * Handles @mention events in channels.
 * Strips the bot user ID mention prefix before processing the question.
 */
export async function handleMention(event: SlackMentionEvent): Promise<void> {
  const { channel, text, ts, user, thread_ts } = event;

  // Strip the bot mention from the text (format: <@BOTID> question text)
  const cleanedText = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!cleanedText) {
    await postMessage(
      channel,
      "Please include a question after mentioning me. For example: `@Athlete Support What are the team selection appeal deadlines?`",
      undefined,
      thread_ts ?? ts,
    );
    return;
  }

  logger.info("Handling mention", { user, channel });

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
  if (detectInjection(cleanedText)) {
    await postMessage(channel, INJECTION_RESPONSE, undefined, thread_ts ?? ts);
    return;
  }

  await addReaction(channel, ts, "eyes");

  const replyTs = thread_ts ?? ts;

  // Process asynchronously — return immediately so Slack gets a fast 200
  processQuery({
    text: cleanedText,
    channel,
    user,
    replyTs,
    conversationId: replyTs,
    logger,
  }).catch((error) => {
    logger.error("Async mention processing failed", {
      error: error instanceof Error ? error.message : String(error),
      user,
      channel,
    });
  });
}
