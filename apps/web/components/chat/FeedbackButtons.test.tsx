import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FeedbackButtons } from "./FeedbackButtons.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch;
});

describe("FeedbackButtons", () => {
  it("renders thumbs up and thumbs down buttons", () => {
    render(<FeedbackButtons conversationId="conv-1" messageId="msg-1" />);
    expect(screen.getByLabelText("Helpful")).toBeInTheDocument();
    expect(screen.getByLabelText("Not helpful")).toBeInTheDocument();
  });

  it("sends score 1 when thumbs up is clicked", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<FeedbackButtons conversationId="conv-1" messageId="msg-1" />);
    fireEvent.click(screen.getByLabelText("Helpful"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-1",
          messageId: "msg-1",
          score: 1,
        }),
      });
    });
  });

  it("sends score 0 when thumbs down is clicked", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<FeedbackButtons conversationId="conv-1" messageId="msg-1" />);
    fireEvent.click(screen.getByLabelText("Not helpful"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-1",
          messageId: "msg-1",
          score: 0,
        }),
      });
    });
  });

  it("disables buttons after selection", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<FeedbackButtons conversationId="conv-1" messageId="msg-1" />);
    fireEvent.click(screen.getByLabelText("Helpful"));

    await waitFor(() => {
      expect(screen.getByLabelText("Helpful")).toBeDisabled();
      expect(screen.getByLabelText("Not helpful")).toBeDisabled();
    });
  });

  it("does not send duplicate requests on double click", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    render(<FeedbackButtons conversationId="conv-1" messageId="msg-1" />);
    fireEvent.click(screen.getByLabelText("Helpful"));
    fireEvent.click(screen.getByLabelText("Helpful"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
