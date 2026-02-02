import { createLogger } from "@usopc/shared";
import { postMessage } from "../slack/client.js";
import { buildAnswerBlocks, buildErrorBlocks } from "../slack/blocks.js";
import { getDisclaimer } from "@usopc/core";

const logger = createLogger({ service: "slack-slash-command" });

export interface SlackSlashCommand {
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  user_id: string;
  user_name: string;
  channel_id: string;
  channel_name: string;
}

/**
 * Handles the /ask-athlete-support slash command.
 * Returns an immediate acknowledgement, then posts the full answer.
 */
export async function handleSlashCommand(
  command: SlackSlashCommand,
): Promise<{ response_type: string; text: string }> {
  const { text, user_id, channel_id } = command;

  if (!text || !text.trim()) {
    return {
      response_type: "ephemeral",
      text: "Please include a question. Usage: `/ask-athlete-support What are the team selection appeal deadlines?`",
    };
  }

  logger.info("Handling slash command", {
    user: user_id,
    channel: channel_id,
    query: text.slice(0, 100),
  });

  // Process asynchronously — post the answer back to the channel
  processSlashCommandAsync(text, channel_id, user_id).catch((error) => {
    logger.error("Slash command async processing failed", {
      error: error instanceof Error ? error.message : String(error),
      user: user_id,
    });
  });

  // Immediate acknowledgement (shown only to the user)
  return {
    response_type: "ephemeral",
    text: "⏳ Looking into that for you...",
  };
}

async function processSlashCommandAsync(
  query: string,
  channel: string,
  userId: string,
): Promise<void> {
  try {
    // TODO: Invoke the LangGraph agent once wired up.
    const answer =
      `<@${userId}> asked: _${query}_\n\n` +
      "The USOPC Athlete Support Agent is being set up. " +
      "Once fully connected, I'll be able to help with team selection, dispute resolution, " +
      "SafeSport, anti-doping, eligibility, governance, and athlete rights questions.";

    const disclaimer = getDisclaimer();
    const blocks = buildAnswerBlocks(answer, [], disclaimer);
    await postMessage(channel, answer, blocks);
  } catch (error) {
    logger.error("Failed to process slash command", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });

    const blocks = buildErrorBlocks(
      "Sorry, I encountered an error processing your question. Please try again.",
    );
    await postMessage(channel, "Error processing request", blocks);
  }
}
