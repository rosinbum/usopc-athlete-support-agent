import type { BaseMessage } from "@langchain/core/messages";
import { getOptionalSecretValue } from "@usopc/shared";

/**
 * Default number of conversation turns to include in context.
 */
const DEFAULT_MAX_TURNS = "5";

/**
 * Maximum length for individual messages before truncation.
 */
const MAX_MESSAGE_LENGTH = 500;

/**
 * Returns the maximum number of conversation turns to include in context.
 * Configurable via CONVERSATION_MAX_TURNS env var or ConversationMaxTurns SST secret.
 */
export function getMaxTurns(): number {
  const value = getOptionalSecretValue(
    "CONVERSATION_MAX_TURNS",
    "ConversationMaxTurns",
    DEFAULT_MAX_TURNS,
  );

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? parseInt(DEFAULT_MAX_TURNS, 10) : parsed;
}

/**
 * Options for formatting conversation history.
 */
export interface FormatHistoryOptions {
  /**
   * Maximum number of conversation turns to include.
   * A turn is one user message + one assistant response.
   * Defaults to getMaxTurns() (5 by default).
   */
  maxTurns?: number;
}

/**
 * Truncates a message to the maximum length with ellipsis.
 */
function truncateMessage(content: string): string {
  if (content.length <= MAX_MESSAGE_LENGTH) return content;
  return content.slice(0, MAX_MESSAGE_LENGTH) + "...";
}

/**
 * Gets the message content as a string.
 */
function getMessageContent(message: BaseMessage): string {
  return typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);
}

/**
 * Determines if a message is a human message.
 */
function isHumanMessage(message: BaseMessage): boolean {
  return (
    message._getType() === "human" ||
    (message as unknown as Record<string, unknown>).role === "user"
  );
}

/**
 * Formats conversation history for inclusion in prompts.
 *
 * Excludes the current (last) message as that will be handled separately.
 * Returns an empty string if there's no prior history.
 *
 * @param messages - Array of conversation messages
 * @param options - Formatting options
 * @returns Formatted conversation history string
 */
export function formatConversationHistory(
  messages: BaseMessage[],
  options?: FormatHistoryOptions,
): string {
  // No history if empty or only one message
  if (messages.length <= 1) return "";

  const maxTurns = options?.maxTurns ?? getMaxTurns();

  // Exclude the current (last) message
  const priorMessages = messages.slice(0, -1);

  // A turn is a user message + assistant response (2 messages)
  const maxMessages = maxTurns * 2;

  // Take the most recent messages up to maxMessages
  const recentMessages = priorMessages.slice(-maxMessages);

  const formattedLines: string[] = [];

  for (const message of recentMessages) {
    const content = truncateMessage(getMessageContent(message));
    const role = isHumanMessage(message) ? "User" : "Assistant";
    formattedLines.push(`${role}: ${content}`);
  }

  return formattedLines.join("\n");
}

/**
 * Result of building a contextual query.
 */
export interface ContextualQuery {
  /**
   * The current user message.
   */
  currentMessage: string;
  /**
   * Formatted conversation history for context.
   */
  conversationContext: string;
}

/**
 * Builds a contextual query by extracting the current message and
 * formatting prior conversation history.
 *
 * @param messages - Array of conversation messages
 * @param options - Formatting options
 * @returns Object with currentMessage and conversationContext
 */
export function buildContextualQuery(
  messages: BaseMessage[],
  options?: FormatHistoryOptions,
): ContextualQuery {
  if (messages.length === 0) {
    return { currentMessage: "", conversationContext: "" };
  }

  // Get the last message (current user message)
  const lastMessage = messages[messages.length - 1];
  const currentMessage = getMessageContent(lastMessage);

  // Format prior history
  const conversationContext = formatConversationHistory(messages, options);

  return { currentMessage, conversationContext };
}
