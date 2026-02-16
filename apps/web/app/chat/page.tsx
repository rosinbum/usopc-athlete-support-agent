"use client";

import { useChat } from "ai/react";
import { useState } from "react";
import { ChatWindow } from "../../components/chat/ChatWindow";
import { DisclaimerBanner } from "../../components/chat/DisclaimerBanner";

export default function ChatPage() {
  const [userSport] = useState<string | undefined>();
  const [conversationId] = useState(() => crypto.randomUUID());
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: "/api/chat",
      body: { userSport, conversationId },
    });

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
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
