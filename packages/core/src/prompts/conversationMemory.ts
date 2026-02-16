import type { BaseMessage } from "@langchain/core/messages";

/**
 * Formats messages into a readable transcript for the summary prompt.
 */
function formatMessages(messages: BaseMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg._getType() === "human" ? "User" : "Assistant";
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      return `${role}: ${content}`;
    })
    .join("\n");
}

/**
 * Builds the prompt for Haiku to generate a rolling conversation summary.
 *
 * The summary preserves key entities, emotional state, and discussion topics
 * so that long conversations retain earlier context without bloating the prompt.
 */
export function buildSummaryPrompt(
  messages: BaseMessage[],
  existingSummary?: string,
): string {
  const transcript = formatMessages(messages);

  const existingBlock = existingSummary
    ? `\n<existing_summary>\n${existingSummary}\n</existing_summary>\n\nUpdate and extend this summary with the new messages below.\n`
    : "";

  return `You are a conversation summarizer for a U.S. Olympic & Paralympic athlete support agent.
${existingBlock}
<conversation>
${transcript}
</conversation>

Produce a concise rolling summary (maximum 300 words) that captures:

1. **Key entities**: Sport(s), NGB(s), specific rules/sections/bylaws discussed, named individuals or organizations
2. **Topics covered**: What governance/compliance/team selection questions were asked and what answers were provided
3. **Emotional state**: Any emotional signals from the user (distress, urgency, fear, frustration) and how they evolved
4. **Unresolved items**: Follow-up questions the user asked, topics that need further clarification, or promises the assistant made
5. **User context**: The user's sport, role, or situation if mentioned

Write the summary in third person, present tense. Be factual and precise. Do not include greetings or filler.`;
}
