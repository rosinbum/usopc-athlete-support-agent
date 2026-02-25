"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface FeedbackButtonsProps {
  conversationId: string;
  messageId: string;
}

export function FeedbackButtons({
  conversationId,
  messageId,
}: FeedbackButtonsProps) {
  const [selected, setSelected] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleClick(score: 0 | 1) {
    if (selected !== null || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, messageId, score }),
      });
      if (res.ok) {
        setSelected(score === 1 ? "up" : "down");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex gap-1 mt-1">
      <button
        type="button"
        aria-label="Helpful"
        disabled={selected !== null || submitting}
        onClick={() => handleClick(1)}
        className={`p-1 rounded transition-colors ${
          selected === "up"
            ? "text-green-600"
            : "text-gray-400 hover:text-gray-600 disabled:opacity-50"
        }`}
      >
        <ThumbsUp className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label="Not helpful"
        disabled={selected !== null || submitting}
        onClick={() => handleClick(0)}
        className={`p-1 rounded transition-colors ${
          selected === "down"
            ? "text-red-600"
            : "text-gray-400 hover:text-gray-600 disabled:opacity-50"
        }`}
      >
        <ThumbsDown className="w-4 h-4" />
      </button>
    </div>
  );
}
