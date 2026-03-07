import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(() => ({
    messages: [],
    sendMessage: vi.fn(),
    status: "ready",
  })),
}));

vi.mock("ai", () => ({
  DefaultChatTransport: vi.fn(),
}));

vi.mock("../../components/chat/ChatWindow", () => ({
  ChatWindow: ({ messages }: { messages: unknown[] }) => (
    <div data-testid="chat-window">Messages: {messages.length}</div>
  ),
}));

vi.mock("../../components/chat/DisclaimerBanner", () => ({
  DisclaimerBanner: () => <div data-testid="disclaimer" />,
}));

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ChatPage from "./page";

const mockUseChat = vi.mocked(useChat);
const MockTransport = vi.mocked(DefaultChatTransport);

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: "ready",
    } as unknown as ReturnType<typeof useChat>);
  });

  it("renders the New Chat button", () => {
    render(<ChatPage />);
    expect(
      screen.getByRole("button", { name: /new chat/i }),
    ).toBeInTheDocument();
  });

  it("renders the Home link", () => {
    render(<ChatPage />);
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("generates a new conversationId when New Chat is clicked", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    // Capture the conversationId from the first DefaultChatTransport call
    const firstCall = MockTransport.mock.calls[0]?.[0] as {
      body?: { conversationId?: string };
    };
    const firstId = firstCall?.body?.conversationId;
    expect(firstId).toBeDefined();

    await user.click(screen.getByRole("button", { name: /new chat/i }));

    // After clicking, ChatSession remounts — new DefaultChatTransport call
    const lastCall = MockTransport.mock.calls[
      MockTransport.mock.calls.length - 1
    ]?.[0] as { body?: { conversationId?: string } };
    const secondId = lastCall?.body?.conversationId;
    expect(secondId).toBeDefined();
    expect(secondId).not.toBe(firstId);
  });
});
