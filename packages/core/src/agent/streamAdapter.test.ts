import { describe, it, expect } from "vitest";
import { agentStreamToEvents } from "./streamAdapter.js";
import type { AgentStreamEvent } from "./streamAdapter.js";
import type { AgentState } from "./state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* mockStateStream(
  updates: Array<Partial<AgentState>>,
): AsyncGenerator<Partial<AgentState>> {
  for (const update of updates) {
    yield update;
  }
}

async function collectEvents(
  stream: AsyncIterable<Partial<AgentState>>,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of agentStreamToEvents(stream)) {
    events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("agentStreamToEvents", () => {
  it("emits text deltas for new answer text", async () => {
    const events = await collectEvents(
      mockStateStream([
        { answer: "Hello" },
        { answer: "Hello world" },
        { answer: "Hello world!" },
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(3);
    expect(textDeltas[0].textDelta).toBe("Hello");
    expect(textDeltas[1].textDelta).toBe(" world");
    expect(textDeltas[2].textDelta).toBe("!");
  });

  it("skips text-delta when answer does not change", async () => {
    const events = await collectEvents(
      mockStateStream([
        { answer: "Hello" },
        { retrievalConfidence: 0.8 }, // no answer field
        { answer: "Hello" }, // same answer, no change
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].textDelta).toBe("Hello");
  });

  it("emits citations event when citations appear", async () => {
    const citations = [
      {
        title: "Selection Procedures",
        documentType: "policy",
        snippet: "Athletes are selected...",
      },
    ];

    const events = await collectEvents(
      mockStateStream([{ answer: "Response", citations }]),
    );

    const citationEvents = events.filter((e) => e.type === "citations");
    expect(citationEvents).toHaveLength(1);
    expect(citationEvents[0].citations).toEqual(citations);
  });

  it("does not emit citations event for empty citations array", async () => {
    const events = await collectEvents(
      mockStateStream([{ answer: "Response", citations: [] }]),
    );

    const citationEvents = events.filter((e) => e.type === "citations");
    expect(citationEvents).toHaveLength(0);
  });

  it("emits escalation event when escalation appears", async () => {
    const escalation = {
      target: "U.S. Center for SafeSport",
      organization: "SafeSport",
      reason: "abuse report",
      urgency: "immediate" as const,
    };

    const events = await collectEvents(
      mockStateStream([{ answer: "Contact SafeSport.", escalation }]),
    );

    const escalationEvents = events.filter((e) => e.type === "escalation");
    expect(escalationEvents).toHaveLength(1);
    expect(escalationEvents[0].escalation).toEqual(escalation);
  });

  it("emits done event at end of stream", async () => {
    const events = await collectEvents(mockStateStream([{ answer: "Hello" }]));

    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("done");
  });

  it("emits done even for empty stream", async () => {
    const events = await collectEvents(mockStateStream([]));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("done");
  });

  it("handles multiple events from a single state update", async () => {
    const citations = [
      { title: "Doc", documentType: "policy", snippet: "..." },
    ];
    const escalation = {
      target: "SafeSport",
      organization: "SafeSport",
      reason: "report",
      urgency: "immediate" as const,
    };

    const events = await collectEvents(
      mockStateStream([{ answer: "Answer", citations, escalation }]),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("text-delta");
    expect(types).toContain("citations");
    expect(types).toContain("escalation");
    expect(types).toContain("done");
  });

  it("does not emit duplicate citations events", async () => {
    const citations = [
      { title: "Doc", documentType: "policy", snippet: "..." },
    ];

    const events = await collectEvents(
      mockStateStream([
        { answer: "Hello", citations },
        { answer: "Hello world", citations }, // same citations again
      ]),
    );

    const citationEvents = events.filter((e) => e.type === "citations");
    // Should only emit once since citations didn't change
    expect(citationEvents).toHaveLength(1);
  });

  it("propagates errors from source stream", async () => {
    async function* failingStream(): AsyncGenerator<Partial<AgentState>> {
      yield { answer: "ok" };
      throw new Error("Source stream failed");
    }

    const events: AgentStreamEvent[] = [];
    await expect(async () => {
      for await (const event of agentStreamToEvents(failingStream())) {
        events.push(event);
      }
    }).rejects.toThrow("Source stream failed");

    // Should have collected the text-delta before the error
    expect(events.some((e) => e.type === "text-delta")).toBe(true);
  });

  it("handles answer going from undefined to a value", async () => {
    const events = await collectEvents(
      mockStateStream([
        { topicDomain: "safesport" }, // no answer
        { answer: "SafeSport info" },
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].textDelta).toBe("SafeSport info");
  });
});
