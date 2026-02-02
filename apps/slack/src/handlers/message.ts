import { createLogger } from "@usopc/shared";
import { postMessage, addReaction } from "../slack/client.js";
import { buildAnswerBlocks, buildErrorBlocks } from "../slack/blocks.js";
import { getDisclaimer } from "@usopc/core";

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

  const { channel, text, ts, user } = event;
  if (!text || !text.trim()) return;

  logger.info("Handling DM", { user, channel });

  // Add a reaction to acknowledge receipt
  await addReaction(channel, ts, "eyes");

  try {
    // TODO: Invoke the LangGraph agent once wired up.
    // For now, return a placeholder response demonstrating the block format.
    const answer =
      "Thank you for your question. The USOPC Athlete Support Agent is being set up. " +
      "Once fully connected, I'll be able to help with team selection, dispute resolution, " +
      "SafeSport, anti-doping, eligibility, governance, and athlete rights questions.";

    const disclaimer = getDisclaimer();

    const blocks = buildAnswerBlocks(answer, [], disclaimer);
    await postMessage(channel, answer, blocks, ts);
  } catch (error) {
    logger.error("Failed to handle message", {
      error: error instanceof Error ? error.message : String(error),
      user,
      channel,
    });

    const blocks = buildErrorBlocks(
      "Sorry, I encountered an error processing your question. Please try again.",
    );
    await postMessage(channel, "Error processing request", blocks, ts);
  }
}
