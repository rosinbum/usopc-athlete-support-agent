import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble.js";
import type { UIMessage } from "ai";

function makeMessage(
  overrides: Partial<UIMessage> & { role: UIMessage["role"] },
): UIMessage {
  return {
    id: "test-id",
    parts: [{ type: "text", text: "Test message" }],
    ...overrides,
  } as UIMessage;
}

describe("MessageBubble", () => {
  it("does not render citations for user messages", () => {
    const message = makeMessage({
      role: "user",
      parts: [
        { type: "text", text: "Hello" },
        {
          type: "data-citations",
          data: {
            type: "citations",
            citations: [
              { title: "Policy", documentType: "policy", snippet: "text" },
            ],
          },
        },
      ] as UIMessage["parts"],
    });
    render(<MessageBubble message={message} />);
    expect(screen.queryByText(/Sources/)).not.toBeInTheDocument();
  });

  it("does not render citations when no data parts present", () => {
    const message = makeMessage({
      role: "assistant",
      parts: [{ type: "text", text: "Test message" }],
    });
    render(<MessageBubble message={message} />);
    expect(screen.queryByText(/Sources/)).not.toBeInTheDocument();
  });

  it("renders citations from data parts for assistant messages", () => {
    const message = makeMessage({
      role: "assistant",
      parts: [
        { type: "text", text: "Here is the answer." },
        {
          type: "data-citations",
          data: {
            type: "citations",
            citations: [
              {
                title: "SafeSport Policy",
                documentType: "policy",
                snippet: "Training required.",
              },
              {
                title: "USOPC Bylaws",
                documentType: "bylaw",
                snippet: "Governance info.",
              },
            ],
          },
        },
      ] as UIMessage["parts"],
    });
    render(<MessageBubble message={message} />);
    expect(screen.getByText(/Sources \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("SafeSport Policy")).toBeInTheDocument();
    expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
  });

  it("hides feedback buttons while streaming", () => {
    const message = makeMessage({
      role: "assistant",
      parts: [{ type: "text", text: "Partial..." }],
    });
    render(
      <MessageBubble
        message={message}
        conversationId="conv-1"
        isStreaming={true}
      />,
    );
    expect(screen.queryByLabelText("Helpful")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Not helpful")).not.toBeInTheDocument();
  });

  it("shows feedback buttons after streaming completes", () => {
    const message = makeMessage({
      role: "assistant",
      parts: [{ type: "text", text: "Done." }],
    });
    render(
      <MessageBubble
        message={message}
        conversationId="conv-1"
        isStreaming={false}
      />,
    );
    expect(screen.getByLabelText("Helpful")).toBeInTheDocument();
    expect(screen.getByLabelText("Not helpful")).toBeInTheDocument();
  });

  it("ignores non-citation data parts", () => {
    const message = makeMessage({
      role: "assistant",
      parts: [
        { type: "text", text: "Answer" },
        {
          type: "data-status",
          data: { type: "status", status: "Searching..." },
        },
        {
          type: "data-citations",
          data: {
            type: "citations",
            citations: [
              { title: "Test Doc", documentType: "rule", snippet: "snippet" },
            ],
          },
        },
      ] as UIMessage["parts"],
    });
    render(<MessageBubble message={message} />);
    expect(screen.getByText(/Sources \(1\)/)).toBeInTheDocument();
  });
});
