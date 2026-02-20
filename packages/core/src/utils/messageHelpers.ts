import type { BaseMessage } from "@langchain/core/messages";

/**
 * Checks whether a LangChain BaseMessage represents a user message.
 *
 * LangChain's `_getType()` returns `"human"` for HumanMessage instances,
 * but some message formats use a `role` property instead. This helper
 * handles both cases.
 */
export function isUserMessage(msg: BaseMessage): boolean {
  return (
    msg._getType() === "human" ||
    (msg as unknown as Record<string, unknown>).role === "user"
  );
}

/**
 * Extracts the text content from the last user message in a message list.
 *
 * Returns an empty string if no user message is found.
 */
export function getLastUserMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (isUserMessage(msg)) {
      return typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    }
  }
  return "";
}
