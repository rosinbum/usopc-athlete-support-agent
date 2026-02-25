import type { Message } from "ai";
import { MarkdownMessage } from "./MarkdownMessage.js";
import { CitationList } from "./CitationList.js";
import { FeedbackButtons } from "./FeedbackButtons.js";
import { isCitationAnnotation, type Citation } from "../../types/citation.js";

interface MessageBubbleProps {
  message: Message;
  conversationId?: string | undefined;
  isStreaming?: boolean;
}

function extractCitations(annotations: Message["annotations"]): Citation[] {
  if (!annotations) return [];
  const results: Citation[] = [];
  for (const ann of annotations) {
    if (isCitationAnnotation(ann)) {
      results.push(...ann.citations);
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
  const citations = isUser ? [] : extractCitations(message.annotations);

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
            {message.content}
          </div>
        ) : (
          <>
            <MarkdownMessage content={message.content} />
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
