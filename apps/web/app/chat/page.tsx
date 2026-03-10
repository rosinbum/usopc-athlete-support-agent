"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageSquarePlus, Shield } from "lucide-react";
import { useState, useMemo, type ChangeEvent, type FormEvent } from "react";

import { ChatWindow } from "../../components/chat/ChatWindow";
import { DisclaimerBanner } from "../../components/chat/DisclaimerBanner";

function ChatSession() {
  const [userSport] = useState<string | undefined>();
  const [conversationId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const [currentStatus, setCurrentStatus] = useState<string | undefined>();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { userSport, conversationId },
      }),
    [userSport, conversationId],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    onData: (dataPart) => {
      const part = dataPart as { type?: string; data?: { status?: string } };
      if (part?.type === "data-status" && part.data?.status) {
        setCurrentStatus(part.data.status);
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  const statusText = isLoading ? currentStatus : undefined;

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setCurrentStatus(undefined);
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestionSubmit = (text: string) => {
    if (isLoading) return;
    setCurrentStatus(undefined);
    sendMessage({ text });
  };

  return (
    <ChatWindow
      messages={messages}
      input={input}
      isLoading={isLoading}
      statusText={statusText}
      conversationId={conversationId}
      onInputChange={handleInputChange}
      onSubmit={handleSubmit}
      onSuggestionSubmit={handleSuggestionSubmit}
    />
  );
}

export default function ChatPage() {
  const [sessionKey, setSessionKey] = useState(0);

  const handleNewChat = () => setSessionKey((k) => k + 1);

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-usopc-navy px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10">
            <Shield className="w-4.5 h-4.5 text-usopc-gold" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Athlete Support Chat
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 text-sm text-usopc-gold hover:text-usopc-gold-dark transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
            New Chat
          </button>
          <a
            href="/"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            Home
          </a>
        </div>
      </header>
      <DisclaimerBanner />
      <ChatSession key={sessionKey} />
    </div>
  );
}
