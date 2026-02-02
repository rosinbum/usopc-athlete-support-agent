import { createLogger } from "@usopc/shared";
import { postMessage, addReaction } from "../slack/client.js";
import { buildAnswerBlocks, buildErrorBlocks } from "../slack/blocks.js";
import { getDisclaimer } from "@usopc/core";

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

  await addReaction(channel, ts, "eyes");

  try {
    // TODO: Invoke the LangGraph agent once wired up.
    const answer =
      "Thank you for your question. The USOPC Athlete Support Agent is being set up. " +
      "Once fully connected, I'll be able to help with team selection, dispute resolution, " +
      "SafeSport, anti-doping, eligibility, governance, and athlete rights questions.";

    const disclaimer = getDisclaimer();
    const blocks = buildAnswerBlocks(answer, [], disclaimer);
    await postMessage(channel, answer, blocks, thread_ts ?? ts);
  } catch (error) {
    logger.error("Failed to handle mention", {
      error: error instanceof Error ? error.message : String(error),
      user,
      channel,
    });

    const blocks = buildErrorBlocks(
      "Sorry, I encountered an error processing your question. Please try again.",
    );
    await postMessage(channel, "Error processing request", blocks, thread_ts ?? ts);
  }
}
