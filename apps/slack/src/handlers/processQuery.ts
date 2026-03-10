import type { Logger } from "@usopc/shared";
import { getAppRunner, convertMessages } from "@usopc/core";
import { postMessage, cleanUpPreviousBotMessages } from "../slack/client.js";
import { buildAnswerBlocks, buildErrorBlocks } from "../slack/blocks.js";

export interface ProcessQueryParams {
  text: string;
  channel: string;
  user: string;
  replyTs: string;
  conversationId: string;
  logger: Logger;
}

/**
 * Shared query processing logic used by both mention and DM handlers.
 * Invokes the agent runner, posts the answer, and cleans up prior messages.
 */
export async function processQuery(params: ProcessQueryParams): Promise<void> {
  const { text, channel, user, replyTs, conversationId, logger } = params;

  try {
    const runner = await getAppRunner();
    const messages = convertMessages([{ role: "user", content: text }]);

    const { answer, citations, escalation, disclaimer } = await runner.invoke({
      messages,
      conversationId,
      userId: `slack:${user}`,
    });

    const blocks = buildAnswerBlocks(answer, citations, disclaimer, escalation);
    const postedTs = await postMessage(channel, answer, blocks, replyTs);

    // Fire-and-forget: strip disclaimer/buttons from previous bot messages
    cleanUpPreviousBotMessages(channel, replyTs, postedTs).catch((error) => {
      logger.error("Failed to clean up previous bot messages", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    logger.error("Failed to process query", {
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
