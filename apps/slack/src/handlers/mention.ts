import { createLogger } from "@usopc/shared";
import {
  getAppRunner,
  loadSummary,
  convertMessages,
  getDisclaimer,
} from "@usopc/core";
import { postMessage, addReaction } from "../slack/client.js";
import { buildAnswerBlocks, buildErrorBlocks } from "../slack/blocks.js";
import { isUserInvited } from "../lib/inviteGuard.js";

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

  await addReaction(channel, ts, "eyes");

  // Process asynchronously — return immediately so Slack gets a fast 200
  processMentionAsync(event, cleanedText).catch((error) => {
    logger.error("Async mention processing failed", {
      error: error instanceof Error ? error.message : String(error),
      user,
      channel,
    });
  });
}

async function processMentionAsync(
  event: SlackMentionEvent,
  cleanedText: string,
): Promise<void> {
  const { channel, ts, user, thread_ts } = event;
  const replyTs = thread_ts ?? ts;

  try {
    const runner = await getAppRunner();
    const conversationId = thread_ts ?? ts;
    const conversationSummary = await loadSummary(conversationId);
    const messages = convertMessages([{ role: "user", content: cleanedText }]);

    const { answer, citations, escalation } = await runner.invoke({
      messages,
      conversationId,
      conversationSummary,
    });

    const disclaimer = getDisclaimer();
    const blocks = buildAnswerBlocks(answer, citations, disclaimer, escalation);
    await postMessage(channel, answer, blocks, replyTs);
  } catch (error) {
    logger.error("Failed to handle mention", {
      error: error instanceof Error ? error.message : String(error),
      user,
      channel,
    });

    const blocks = buildErrorBlocks(
      "Sorry, I encountered an error processing your question. Please try again.",
    );
    await postMessage(channel, "Error processing request", blocks, replyTs);
  }
}
