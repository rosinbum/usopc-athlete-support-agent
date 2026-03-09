"use client";

import type { UIMessage } from "ai";
import { MessageBubble } from "./MessageBubble";
import { Send } from "lucide-react";
import { FormEvent, ChangeEvent, useRef, useEffect } from "react";

interface ChatWindowProps {
  messages: UIMessage[];
  input: string;
  isLoading: boolean;
  statusText?: string | undefined;
  conversationId?: string | undefined;
  onInputChange: (
    e: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

export function ChatWindow({
  messages,
  input,
  isLoading,
  statusText,
  conversationId,
  onInputChange,
  onSubmit,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center mt-20">
            <div className="w-12 h-1 bg-usopc-red mx-auto mb-6 rounded-full" />
            <p className="text-xl font-semibold text-usopc-navy">
              Welcome to Athlete Support
            </p>
            <p className="mt-2 text-usopc-gray-500">
              Ask me about team selection, dispute resolution, SafeSport,
              anti-doping, eligibility, governance, or athlete rights.
            </p>
          </div>
        )}
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            conversationId={conversationId}
            isStreaming={isLoading && index === messages.length - 1}
          />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-usopc-gray-500">
            <div className="animate-pulse">{statusText ?? "Thinking..."}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-usopc-gray-200 px-4 py-4">
        <form onSubmit={onSubmit} className="flex gap-3 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={onInputChange}
            placeholder="Ask about governance, team selection, disputes..."
            className="flex-1 rounded-lg border border-usopc-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-usopc-navy focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-lg bg-usopc-red px-4 py-3 text-white hover:bg-usopc-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
