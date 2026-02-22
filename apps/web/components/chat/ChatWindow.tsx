"use client";

import type { Message } from "ai";
import { MessageBubble } from "./MessageBubble";
import { Send } from "lucide-react";
import { FormEvent, ChangeEvent, useRef, useEffect } from "react";

interface ChatWindowProps {
  messages: Message[];
  input: string;
  isLoading: boolean;
  statusText?: string | undefined;
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
          <div className="text-center text-gray-500 mt-20">
            <p className="text-lg font-medium">Welcome to Athlete Support</p>
            <p className="mt-2">
              Ask me about team selection, dispute resolution, SafeSport,
              anti-doping, eligibility, governance, or athlete rights.
            </p>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="animate-pulse">{statusText ?? "Thinking..."}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 px-4 py-4">
        <form onSubmit={onSubmit} className="flex gap-3 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={onInputChange}
            placeholder="Ask about governance, team selection, disputes..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
