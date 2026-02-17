import { describe, it, expect } from "vitest";
import {
  agentStreamToEvents,
  legacyStateStreamToEvents,
} from "./streamAdapter.js";
import type { AgentStreamEvent } from "./streamAdapter.js";
import type { AgentState } from "./state.js";
import type { StreamChunk } from "./runner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock dual-mode stream with both "values" and "messages" chunks.
 */
async function* mockDualStream(
  chunks: StreamChunk[],
): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/**
 * Creates a mock state-only stream for legacy adapter testing.
 */
async function* mockStateStream(
  updates: Array<Partial<AgentState>>,
): AsyncGenerator<Partial<AgentState>> {
  for (const update of updates) {
    yield update;
  }
}

async function collectEvents(
  stream: AsyncIterable<StreamChunk>,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of agentStreamToEvents(stream)) {
    events.push(event);
  }
  return events;
}

async function collectLegacyEvents(
  stream: AsyncIterable<Partial<AgentState>>,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of legacyStateStreamToEvents(stream)) {
    events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests for dual-mode streaming (new)
// ---------------------------------------------------------------------------

describe("agentStreamToEvents (dual-mode)", () => {
  it("emits text deltas from synthesizer messages", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "Hello" }, { langgraph_node: "synthesizer" }]],
        [
          "messages",
          [{ content: " world" }, { langgraph_node: "synthesizer" }],
        ],
        ["messages", [{ content: "!" }, { langgraph_node: "synthesizer" }]],
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(3);
    expect(textDeltas[0].textDelta).toBe("Hello");
    expect(textDeltas[1].textDelta).toBe(" world");
    expect(textDeltas[2].textDelta).toBe("!");
  });

  it("filters out messages from non-synthesizer nodes", async () => {
    const events = await collectEvents(
      mockDualStream([
        [
          "messages",
          [
            { content: '{"topicDomain":"safesport"}' },
            { langgraph_node: "classifier" },
          ],
        ],
        [
          "messages",
          [{ content: "Actual answer" }, { langgraph_node: "synthesizer" }],
        ],
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].textDelta).toBe("Actual answer");
  });

  it("handles array content format from messages", async () => {
    const events = await collectEvents(
      mockDualStream([
        [
          "messages",
          [
            {
              content: [
                { type: "text", text: "Part 1" },
                { type: "text", text: "Part 2" },
              ],
            },
            { langgraph_node: "synthesizer" },
          ],
        ],
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].textDelta).toBe("Part 1Part 2");
  });

  it("emits citations from values mode", async () => {
    const citations = [
      {
        title: "Selection Procedures",
        documentType: "policy",
        snippet: "Athletes are selected...",
      },
    ];

    const events = await collectEvents(
      mockDualStream([["values", { citations }]]),
    );

    const citationEvents = events.filter((e) => e.type === "citations");
    expect(citationEvents).toHaveLength(1);
    expect(citationEvents[0].citations).toEqual(citations);
  });

  it("does not emit citations event for empty citations array", async () => {
    const events = await collectEvents(
      mockDualStream([["values", { citations: [] }]]),
    );

    const citationEvents = events.filter((e) => e.type === "citations");
    expect(citationEvents).toHaveLength(0);
  });

  it("emits escalation from values mode", async () => {
    const escalation = {
      target: "U.S. Center for SafeSport",
      organization: "SafeSport",
      reason: "abuse report",
      urgency: "immediate" as const,
    };

    const events = await collectEvents(
      mockDualStream([["values", { escalation }]]),
    );

    const escalationEvents = events.filter((e) => e.type === "escalation");
    expect(escalationEvents).toHaveLength(1);
    expect(escalationEvents[0].escalation).toEqual(escalation);
  });

  it("emits done event at end of stream", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "Hi" }, { langgraph_node: "synthesizer" }]],
      ]),
    );

    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("done");
  });

  it("emits done even for empty stream", async () => {
    const events = await collectEvents(mockDualStream([]));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("done");
  });

  it("handles interleaved messages and values", async () => {
    const citations = [
      { title: "Doc", documentType: "policy", snippet: "..." },
    ];

    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "First" }, { langgraph_node: "synthesizer" }]],
        ["values", { citations }],
        [
          "messages",
          [{ content: " second" }, { langgraph_node: "synthesizer" }],
        ],
      ]),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("text-delta");
    expect(types).toContain("citations");
    expect(types).toContain("done");
    expect(events.filter((e) => e.type === "text-delta")).toHaveLength(2);
  });

  it("does not emit duplicate citations events", async () => {
    const citations = [
      { title: "Doc", documentType: "policy", snippet: "..." },
    ];

    const events = await collectEvents(
      mockDualStream([
        ["values", { citations }],
        ["values", { citations }],
      ]),
    );

    const citationEvents = events.filter((e) => e.type === "citations");
    expect(citationEvents).toHaveLength(1);
  });

  it("skips messages with empty content", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "" }, { langgraph_node: "synthesizer" }]],
        [
          "messages",
          [{ content: "Real content" }, { langgraph_node: "synthesizer" }],
        ],
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].textDelta).toBe("Real content");
  });

  it("skips messages without node metadata", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "No node" }, {}]],
        [
          "messages",
          [{ content: "With node" }, { langgraph_node: "synthesizer" }],
        ],
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].textDelta).toBe("With node");
  });

  it("emits answer from values mode when no synthesizer tokens (clarify node)", async () => {
    // This simulates the clarify node path where answer is set directly
    // without going through the synthesizer LLM
    const events = await collectEvents(
      mockDualStream([
        ["values", { topicDomain: "team_selection", needsClarification: true }],
        ["values", { answer: "Which sport are you asking about?" }],
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].textDelta).toBe("Which sport are you asking about?");
  });

  it("does not duplicate answer when synthesizer tokens are present", async () => {
    // When synthesizer streams tokens, don't also emit from values mode
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "Hello" }, { langgraph_node: "synthesizer" }]],
        [
          "messages",
          [{ content: " world" }, { langgraph_node: "synthesizer" }],
        ],
        ["values", { answer: "Hello world" }], // This should be ignored
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(2);
    expect(textDeltas[0].textDelta).toBe("Hello");
    expect(textDeltas[1].textDelta).toBe(" world");
  });

  it("emits incremental answer changes from values mode", async () => {
    // Test that answer changes are emitted incrementally (like escalate node)
    const events = await collectEvents(
      mockDualStream([
        ["values", { answer: "Please contact " }],
        ["values", { answer: "Please contact SafeSport" }],
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(2);
    expect(textDeltas[0].textDelta).toBe("Please contact ");
    expect(textDeltas[1].textDelta).toBe("SafeSport");
  });

  it("emits error event when stream throws", async () => {
    async function* failingStream(): AsyncGenerator<StreamChunk> {
      yield [
        "messages",
        [{ content: "Hello" }, { langgraph_node: "synthesizer" }],
      ];
      throw new Error("Stream broke");
    }

    const events: AgentStreamEvent[] = [];
    for await (const event of agentStreamToEvents(failingStream())) {
      events.push(event);
    }

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].error?.message).toBe("Stream broke");
    expect(errorEvents[0].error?.code).toBe("GRAPH_ERROR");

    // Should still emit done after error
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("done");
  });

  it("maps TimeoutError to GRAPH_TIMEOUT code", async () => {
    const { TimeoutError } = await import("../utils/withTimeout.js");

    async function* timeoutStream(): AsyncGenerator<StreamChunk> {
      throw new TimeoutError("graph.stream", 120000);
    }

    const events: AgentStreamEvent[] = [];
    for await (const event of agentStreamToEvents(timeoutStream())) {
      events.push(event);
    }

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].error?.code).toBe("GRAPH_TIMEOUT");
    expect(errorEvents[0].error?.message).toContain("timed out");
  });

  it("maps AppError to its error code", async () => {
    const { AppError } = await import("@usopc/shared");

    async function* appErrorStream(): AsyncGenerator<StreamChunk> {
      throw new AppError("Something failed", { code: "RETRIEVAL_ERROR" });
    }

    const events: AgentStreamEvent[] = [];
    for await (const event of agentStreamToEvents(appErrorStream())) {
      events.push(event);
    }

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].error?.code).toBe("RETRIEVAL_ERROR");
  });

  it("emits answer-reset when quality check fails after synthesizer tokens", async () => {
    const events = await collectEvents(
      mockDualStream([
        [
          "messages",
          [{ content: "Generic " }, { langgraph_node: "synthesizer" }],
        ],
        [
          "messages",
          [{ content: "answer" }, { langgraph_node: "synthesizer" }],
        ],
        [
          "values",
          {
            qualityCheckResult: {
              passed: false,
              score: 0.3,
              issues: [
                {
                  type: "generic_response",
                  description: "Too generic",
                  severity: "major",
                },
              ],
              critique: "Be more specific.",
            },
          },
        ],
        // After reset, new synthesizer tokens should flow
        [
          "messages",
          [{ content: "Specific " }, { langgraph_node: "synthesizer" }],
        ],
        [
          "messages",
          [{ content: "answer" }, { langgraph_node: "synthesizer" }],
        ],
      ]),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("answer-reset");

    // Should have text-delta before reset, then answer-reset, then more text-deltas
    const resetIndex = types.indexOf("answer-reset");
    const textDeltasBefore = events
      .slice(0, resetIndex)
      .filter((e) => e.type === "text-delta");
    const textDeltasAfter = events
      .slice(resetIndex + 1)
      .filter((e) => e.type === "text-delta");
    expect(textDeltasBefore.length).toBeGreaterThan(0);
    expect(textDeltasAfter.length).toBeGreaterThan(0);
  });

  it("does not emit answer-reset when quality check passes", async () => {
    const events = await collectEvents(
      mockDualStream([
        [
          "messages",
          [{ content: "Good answer" }, { langgraph_node: "synthesizer" }],
        ],
        [
          "values",
          {
            qualityCheckResult: {
              passed: true,
              score: 0.9,
              issues: [],
              critique: "",
            },
          },
        ],
      ]),
    );

    const types = events.map((e) => e.type);
    expect(types).not.toContain("answer-reset");
  });

  it("emits discovered-urls event at end of stream when URLs are present", async () => {
    const discoveredUrls = [
      {
        url: "https://usopc.org/doc1",
        title: "Selection Procedures",
        content: "result content",
        score: 0.9,
      },
    ];

    const events = await collectEvents(
      mockDualStream([
        ["values", { webSearchResultUrls: discoveredUrls }],
        [
          "messages",
          [{ content: "Answer text" }, { langgraph_node: "synthesizer" }],
        ],
      ]),
    );

    const discoveredEvents = events.filter((e) => e.type === "discovered-urls");
    expect(discoveredEvents).toHaveLength(1);
    expect(discoveredEvents[0].discoveredUrls).toEqual(discoveredUrls);

    // discovered-urls should come before done
    const types = events.map((e) => e.type);
    const discoveredIndex = types.indexOf("discovered-urls");
    const doneIndex = types.indexOf("done");
    expect(discoveredIndex).toBeLessThan(doneIndex);
  });

  it("does not emit discovered-urls when no URLs are present", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["values", { webSearchResultUrls: [] }],
        [
          "messages",
          [{ content: "Answer" }, { langgraph_node: "synthesizer" }],
        ],
      ]),
    );

    const discoveredEvents = events.filter((e) => e.type === "discovered-urls");
    expect(discoveredEvents).toHaveLength(0);
  });

  it("does not emit discovered-urls when stream errors after researcher populates URLs", async () => {
    async function* errorAfterUrls(): AsyncGenerator<StreamChunk> {
      yield [
        "values",
        {
          webSearchResultUrls: [
            {
              url: "https://usopc.org/doc1",
              title: "Doc",
              content: "content",
              score: 0.9,
            },
          ],
        },
      ];
      throw new Error("Stream broke after researcher");
    }

    const events: AgentStreamEvent[] = [];
    for await (const event of agentStreamToEvents(errorAfterUrls())) {
      events.push(event);
    }

    const discoveredEvents = events.filter((e) => e.type === "discovered-urls");
    expect(discoveredEvents).toHaveLength(0);

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);

    expect(events[events.length - 1].type).toBe("done");
  });

  it("does not emit answer-reset when no synthesizer tokens seen", async () => {
    const events = await collectEvents(
      mockDualStream([
        [
          "values",
          {
            qualityCheckResult: {
              passed: false,
              score: 0.3,
              issues: [],
              critique: "Bad",
            },
          },
        ],
      ]),
    );

    const types = events.map((e) => e.type);
    expect(types).not.toContain("answer-reset");
  });

  it("emits text deltas before error event when stream partially succeeds", async () => {
    async function* partialStream(): AsyncGenerator<StreamChunk> {
      yield [
        "messages",
        [{ content: "Partial " }, { langgraph_node: "synthesizer" }],
      ];
      yield [
        "messages",
        [{ content: "response" }, { langgraph_node: "synthesizer" }],
      ];
      throw new Error("Broke midway");
    }

    const events: AgentStreamEvent[] = [];
    for await (const event of agentStreamToEvents(partialStream())) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(2);
    expect(textDeltas[0].textDelta).toBe("Partial ");
    expect(textDeltas[1].textDelta).toBe("response");

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);

    expect(events[events.length - 1].type).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Tests for legacy state-only streaming
// ---------------------------------------------------------------------------

describe("legacyStateStreamToEvents", () => {
  it("emits text deltas for new answer text", async () => {
    const events = await collectLegacyEvents(
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
    const events = await collectLegacyEvents(
      mockStateStream([
        { answer: "Hello" },
        { retrievalConfidence: 0.8 },
        { answer: "Hello" },
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

    const events = await collectLegacyEvents(
      mockStateStream([{ answer: "Response", citations }]),
    );

    const citationEvents = events.filter((e) => e.type === "citations");
    expect(citationEvents).toHaveLength(1);
    expect(citationEvents[0].citations).toEqual(citations);
  });

  it("does not emit citations event for empty citations array", async () => {
    const events = await collectLegacyEvents(
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

    const events = await collectLegacyEvents(
      mockStateStream([{ answer: "Contact SafeSport.", escalation }]),
    );

    const escalationEvents = events.filter((e) => e.type === "escalation");
    expect(escalationEvents).toHaveLength(1);
    expect(escalationEvents[0].escalation).toEqual(escalation);
  });

  it("emits done event at end of stream", async () => {
    const events = await collectLegacyEvents(
      mockStateStream([{ answer: "Hello" }]),
    );

    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("done");
  });

  it("emits done even for empty stream", async () => {
    const events = await collectLegacyEvents(mockStateStream([]));

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

    const events = await collectLegacyEvents(
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

    const events = await collectLegacyEvents(
      mockStateStream([
        { answer: "Hello", citations },
        { answer: "Hello world", citations },
      ]),
    );

    const citationEvents = events.filter((e) => e.type === "citations");
    expect(citationEvents).toHaveLength(1);
  });

  it("propagates errors from source stream", async () => {
    async function* failingStream(): AsyncGenerator<Partial<AgentState>> {
      yield { answer: "ok" };
      throw new Error("Source stream failed");
    }

    const events: AgentStreamEvent[] = [];
    await expect(async () => {
      for await (const event of legacyStateStreamToEvents(failingStream())) {
        events.push(event);
      }
    }).rejects.toThrow("Source stream failed");

    expect(events.some((e) => e.type === "text-delta")).toBe(true);
  });

  it("handles answer going from undefined to a value", async () => {
    const events = await collectLegacyEvents(
      mockStateStream([
        { topicDomain: "safesport" },
        { answer: "SafeSport info" },
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].textDelta).toBe("SafeSport info");
  });
});
