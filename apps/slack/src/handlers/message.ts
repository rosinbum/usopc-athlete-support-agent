import { createLogger } from "@usopc/shared";
import { getAppRunner, loadSummary, convertMessages } from "@usopc/core";
import { postMessage, addReaction } from "../slack/client.js";
import { buildAnswerBlocks, buildErrorBlocks } from "../slack/blocks.js";
import { isUserInvited } from "../lib/inviteGuard.js";

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

  // Add a reaction to acknowledge receipt
  await addReaction(channel, ts, "eyes");

  // Process asynchronously — return immediately so Slack gets a fast 200
  processMessageAsync(event).catch((error) => {
    logger.error("Async message processing failed", {
      error: error instanceof Error ? error.message : String(error),
      user,
      channel,
    });
  });
}

async function processMessageAsync(event: SlackMessageEvent): Promise<void> {
  const { channel, text, ts, user, thread_ts } = event;
  const replyTs = thread_ts ?? ts;

  try {
    const runner = await getAppRunner();
    const conversationId = thread_ts ?? ts;
    const conversationSummary = await loadSummary(conversationId);
    const messages = convertMessages([{ role: "user", content: text.trim() }]);

    const { answer, citations, escalation } = await runner.invoke({
      messages,
      conversationId,
      conversationSummary,
    });

    const blocks = buildAnswerBlocks(answer, citations, undefined, escalation);
    await postMessage(channel, answer, blocks, replyTs);
  } catch (error) {
    logger.error("Failed to handle message", {
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
