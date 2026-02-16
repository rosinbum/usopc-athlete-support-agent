import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble.js";
import type { Message } from "ai";

function makeMessage(
  overrides: Partial<Message> & { role: Message["role"] },
): Message {
  return {
    id: "test-id",
    content: "Test message",
    ...overrides,
  };
}

describe("MessageBubble", () => {
  it("does not render citations for user messages", () => {
    const message = makeMessage({
      role: "user",
      annotations: [
        {
          type: "citations",
          citations: [
            { title: "Policy", documentType: "policy", snippet: "text" },
          ],
        },
      ],
    });
    render(<MessageBubble message={message} />);
    expect(screen.queryByText(/Sources/)).not.toBeInTheDocument();
  });

  it("does not render citations when annotations is undefined", () => {
    const message = makeMessage({ role: "assistant" });
    render(<MessageBubble message={message} />);
    expect(screen.queryByText(/Sources/)).not.toBeInTheDocument();
  });

  it("renders citations from annotations for assistant messages", () => {
    const message = makeMessage({
      role: "assistant",
      content: "Here is the answer.",
      annotations: [
        {
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
      ],
    });
    render(<MessageBubble message={message} />);
    expect(screen.getByText(/Sources \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("SafeSport Policy")).toBeInTheDocument();
    expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
  });

  it("ignores non-citation annotations", () => {
    const message = makeMessage({
      role: "assistant",
      annotations: [
        { type: "other", data: "something" },
        {
          type: "citations",
          citations: [
            { title: "Test Doc", documentType: "rule", snippet: "snippet" },
          ],
        },
      ],
    });
    render(<MessageBubble message={message} />);
    expect(screen.getByText(/Sources \(1\)/)).toBeInTheDocument();
  });
});
