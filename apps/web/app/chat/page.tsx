"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useMemo, type ChangeEvent, type FormEvent } from "react";
import { ChatWindow } from "../../components/chat/ChatWindow";
import { DisclaimerBanner } from "../../components/chat/DisclaimerBanner";

export default function ChatPage() {
  const [userSport] = useState<string | undefined>();
  const [conversationId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const [currentStatus, setCurrentStatus] = useState<string | undefined>();

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { userSport, conversationId },
    }),
    onData: (dataPart) => {
      const part = dataPart as { type?: string; data?: { status?: string } };
      if (part?.type === "data-status" && part.data?.status) {
        setCurrentStatus(part.data.status);
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Clear status when streaming finishes
  const statusText = useMemo(() => {
    if (!isLoading) return undefined;
    return currentStatus;
  }, [isLoading, currentStatus]);

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Athlete Support Chat</h1>
        <a href="/" className="text-sm text-blue-600 hover:underline">
          Home
        </a>
      </header>
      <DisclaimerBanner />
      <ChatWindow
        messages={messages}
        input={input}
        isLoading={isLoading}
        statusText={statusText}
        conversationId={conversationId}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
