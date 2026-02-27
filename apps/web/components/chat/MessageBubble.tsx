import type { UIMessage } from "ai";
import { MarkdownMessage } from "./MarkdownMessage.js";
import { CitationList } from "./CitationList.js";
import { FeedbackButtons } from "./FeedbackButtons.js";
import { isCitationAnnotation, type Citation } from "../../types/citation.js";

interface MessageBubbleProps {
  message: UIMessage;
  conversationId?: string | undefined;
  isStreaming?: boolean;
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function extractCitations(message: UIMessage): Citation[] {
  const results: Citation[] = [];
  for (const part of message.parts) {
    if ("type" in part && "data" in part) {
      const data = (part as { type: string; data: unknown }).data;
      if (isCitationAnnotation(data)) {
        results.push(...data.citations);
      }
    }
  }
  return results;
}

export function MessageBubble({
  message,
  conversationId,
  isStreaming,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const content = getMessageText(message);
  const citations = isUser ? [] : extractCitations(message);

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} max-w-4xl mx-auto`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {content}
          </div>
        ) : (
          <>
            <MarkdownMessage content={content} />
            <CitationList citations={citations} />
            {conversationId && !isStreaming && (
              <FeedbackButtons
                conversationId={conversationId}
                messageId={message.id}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
