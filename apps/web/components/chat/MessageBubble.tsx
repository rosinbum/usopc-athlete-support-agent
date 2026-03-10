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

  // Hide empty assistant bubble while waiting for streamed content
  if (!isUser && !content && isStreaming) return null;

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} max-w-4xl mx-auto`}
    >
      <div
        className={`max-w-[80%] px-4 py-3 ${
          isUser
            ? "rounded-2xl rounded-br-md bg-usopc-navy text-white"
            : "rounded-2xl rounded-bl-md bg-usopc-gray-100 text-usopc-gray-900 shadow-sm"
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
