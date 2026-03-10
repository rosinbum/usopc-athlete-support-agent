"use client";

import type { UIMessage } from "ai";
import { MessageBubble } from "./MessageBubble";
import { Send, Shield } from "lucide-react";
import {
  FormEvent,
  ChangeEvent,
  KeyboardEvent,
  useRef,
  useEffect,
} from "react";

const SUGGESTIONS = [
  "How does team selection work?",
  "What are my rights under the Ted Stevens Act?",
  "Explain the arbitration process",
  "How do I report a SafeSport concern?",
  "What is the TEAM USA Athletes' Commission?",
  "Who oversees my sport's governing body?",
];

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
  onSuggestionSubmit?: ((text: string) => void) | undefined;
}

export function ChatWindow({
  messages,
  input,
  isLoading,
  statusText,
  conversationId,
  onInputChange,
  onSubmit,
  onSuggestionSubmit,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) form.requestSubmit();
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 bg-usopc-gray-50/50 chat-scrollbar">
        {messages.length === 0 && (
          <div className="text-center mt-20">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-usopc-navy/5 mb-5">
              <Shield className="w-7 h-7 text-usopc-navy/70" />
            </div>
            <div className="w-10 h-0.5 bg-usopc-gold mx-auto mb-5 rounded-full" />
            <p className="text-xl font-semibold text-usopc-navy">
              Welcome to Athlete Support
            </p>
            <p className="mt-2 text-usopc-gray-500 max-w-md mx-auto">
              Ask me about team selection, dispute resolution, SafeSport,
              anti-doping, eligibility, governance, or athlete rights.
            </p>
            {onSuggestionSubmit && (
              <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onSuggestionSubmit(suggestion)}
                    className="rounded-full border border-usopc-gray-300 bg-white px-4 py-2 text-sm text-usopc-gray-700 hover:border-usopc-navy hover:text-usopc-navy hover:bg-usopc-navy/5 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
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
          <div className="flex items-center gap-3 max-w-4xl mx-auto text-usopc-gray-500">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-usopc-navy/40 animate-bounce" />
              <span
                className="w-2 h-2 rounded-full bg-usopc-navy/40 animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-2 h-2 rounded-full bg-usopc-navy/40 animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
            <span className="text-sm">{statusText ?? "Thinking..."}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-usopc-gray-200 px-4 py-4">
        <form onSubmit={onSubmit} className="flex gap-3 max-w-4xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={onInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about governance, team selection, disputes..."
            rows={1}
            className="flex-1 rounded-xl border border-usopc-gray-300 px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-usopc-navy/40 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="self-end rounded-xl bg-usopc-red px-4 py-3 text-white hover:bg-usopc-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
