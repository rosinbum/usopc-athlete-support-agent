import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Message } from "ai";
import { ChatWindow } from "./ChatWindow.js";

// scrollIntoView is not available in jsdom
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("./MessageBubble.js", () => ({
  MessageBubble: ({ message }: { message: Message }) => (
    <div data-testid={`message-${message.id}`}>{message.content}</div>
  ),
}));

function makeMessage(overrides: Partial<Message> & { id: string }): Message {
  return {
    role: "user",
    content: "Test message",
    ...overrides,
  };
}

const defaultProps = {
  messages: [] as Message[],
  input: "",
  isLoading: false,
  onInputChange: vi.fn(),
  onSubmit: vi.fn(),
};

describe("ChatWindow", () => {
  it("renders welcome message when messages is empty", () => {
    render(<ChatWindow {...defaultProps} />);
    expect(screen.getByText("Welcome to Athlete Support")).toBeInTheDocument();
  });

  it("renders MessageBubble for each message", () => {
    const messages = [
      makeMessage({ id: "1", role: "user", content: "Hello" }),
      makeMessage({ id: "2", role: "assistant", content: "Hi there" }),
    ];
    render(<ChatWindow {...defaultProps} messages={messages} />);
    expect(screen.getByTestId("message-1")).toBeInTheDocument();
    expect(screen.getByTestId("message-2")).toBeInTheDocument();
    expect(
      screen.queryByText("Welcome to Athlete Support"),
    ).not.toBeInTheDocument();
  });

  it("shows 'Thinking...' when isLoading is true", () => {
    render(<ChatWindow {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("shows custom statusText instead of 'Thinking...' when provided", () => {
    render(
      <ChatWindow
        {...defaultProps}
        isLoading={true}
        statusText="Searching documents..."
      />,
    );
    expect(screen.getByText("Searching documents...")).toBeInTheDocument();
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("hides loading indicator when isLoading is false", () => {
    render(<ChatWindow {...defaultProps} isLoading={false} />);
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("disables input when isLoading is true", () => {
    render(<ChatWindow {...defaultProps} isLoading={true} />);
    const input = screen.getByPlaceholderText(/Ask about governance/);
    expect(input).toBeDisabled();
  });

  it("disables submit button when isLoading is true", () => {
    render(<ChatWindow {...defaultProps} input="Hello" isLoading={true} />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("disables submit button when input is empty", () => {
    render(<ChatWindow {...defaultProps} input="" isLoading={false} />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("enables submit button when input is non-empty and not loading", () => {
    render(<ChatWindow {...defaultProps} input="Hello" isLoading={false} />);
    const button = screen.getByRole("button");
    expect(button).not.toBeDisabled();
  });

  it("calls onSubmit when form is submitted", async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <ChatWindow
        {...defaultProps}
        input="Hello"
        isLoading={false}
        onSubmit={onSubmit}
      />,
    );
    const button = screen.getByRole("button");
    await userEvent.click(button);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("calls onInputChange when user types", async () => {
    const onInputChange = vi.fn();
    render(
      <ChatWindow
        {...defaultProps}
        isLoading={false}
        onInputChange={onInputChange}
      />,
    );
    const input = screen.getByPlaceholderText(/Ask about governance/);
    await userEvent.type(input, "a");
    expect(onInputChange).toHaveBeenCalled();
  });
});
