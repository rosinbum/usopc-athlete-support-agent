import { describe, it, expect } from "vitest";
import { agentStreamToEvents } from "./streamAdapter.js";
import type { AgentStreamEvent } from "./streamAdapter.js";
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

async function collectEvents(
  stream: AsyncIterable<StreamChunk>,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of agentStreamToEvents(stream)) {
    events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests for dual-mode streaming
// ---------------------------------------------------------------------------

describe("agentStreamToEvents (dual-mode)", () => {
  it("buffers synthesizer tokens and flushes at stream end when no quality check runs", async () => {
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
    expect(textDeltas[0]!.textDelta).toBe("Hello");
    expect(textDeltas[1]!.textDelta).toBe(" world");
    expect(textDeltas[2]!.textDelta).toBe("!");

    // Tokens should appear before done
    const types = events.map((e) => e.type);
    const firstDelta = types.indexOf("text-delta");
    const doneIndex = types.indexOf("done");
    expect(firstDelta).toBeLessThan(doneIndex);
  });

  it("flushes synthesizer buffer when quality check passes", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "Good" }, { langgraph_node: "synthesizer" }]],
        [
          "messages",
          [{ content: " answer" }, { langgraph_node: "synthesizer" }],
        ],
        [
          "values",
          {
            answer: "Good answer",
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

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(2);
    expect(textDeltas[0]!.textDelta).toBe("Good");
    expect(textDeltas[1]!.textDelta).toBe(" answer");
  });

  it("buffers synthesizer tokens until quality check passes, then only emits retry tokens", async () => {
    const events = await collectEvents(
      mockDualStream([
        // First synthesizer run
        [
          "messages",
          [{ content: "Generic " }, { langgraph_node: "synthesizer" }],
        ],
        [
          "messages",
          [{ content: "answer" }, { langgraph_node: "synthesizer" }],
        ],
        // Quality check fails (retryCount=0, maxRetries=1 → retry will happen)
        [
          "values",
          {
            answer: "Generic answer",
            qualityRetryCount: 0,
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
        // Retry synthesizer tokens
        [
          "messages",
          [{ content: "Specific " }, { langgraph_node: "synthesizer" }],
        ],
        [
          "messages",
          [{ content: "answer" }, { langgraph_node: "synthesizer" }],
        ],
        // Quality check passes
        [
          "values",
          {
            answer: "Specific answer",
            qualityRetryCount: 1,
            qualityCheckResult: {
              passed: true,
              score: 0.85,
              issues: [],
              critique: "",
            },
          },
        ],
      ]),
    );

    // Only retry tokens should appear (first set discarded)
    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(2);
    const combined = textDeltas.map((e) => e.textDelta).join("");
    expect(combined).toBe("Specific answer");
    expect(combined).not.toContain("Generic");

    // No answer-reset event emitted
    const types = events.map((e) => e.type);
    expect(types).not.toContain("answer-reset");
  });

  it("flushes buffer when quality fails but max retries exhausted", async () => {
    const events = await collectEvents(
      mockDualStream([
        // First synthesizer
        [
          "messages",
          [{ content: "Generic " }, { langgraph_node: "synthesizer" }],
        ],
        [
          "messages",
          [{ content: "answer" }, { langgraph_node: "synthesizer" }],
        ],
        // Quality fails, retry coming (retryCount=0 < maxRetries=1)
        [
          "values",
          {
            answer: "Generic answer",
            qualityRetryCount: 0,
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
        // Retry synthesizer
        [
          "messages",
          [{ content: "Still " }, { langgraph_node: "synthesizer" }],
        ],
        [
          "messages",
          [{ content: "generic" }, { langgraph_node: "synthesizer" }],
        ],
        // Quality fails again, retries exhausted (retryCount=1 >= maxRetries=1)
        [
          "values",
          {
            answer: "Still generic",
            qualityRetryCount: 1,
            qualityCheckResult: {
              passed: false,
              score: 0.35,
              issues: [
                {
                  type: "generic_response",
                  description: "Still too generic",
                  severity: "major",
                },
              ],
              critique: "Still not specific enough.",
            },
          },
        ],
      ]),
    );

    // Only retry tokens should be emitted (first buffer discarded, second flushed)
    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(2);
    const combined = textDeltas.map((e) => e.textDelta).join("");
    expect(combined).toBe("Still generic");
    expect(combined).not.toContain("Generic answer");
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
    expect(textDeltas[0]!.textDelta).toBe("Actual answer");
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
    expect(textDeltas[0]!.textDelta).toBe("Part 1Part 2");
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
    expect(citationEvents[0]!.citations).toEqual(citations);
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
    expect(escalationEvents[0]!.escalation).toEqual(escalation);
  });

  it("emits done event at end of stream", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "Hi" }, { langgraph_node: "synthesizer" }]],
      ]),
    );

    const lastEvent = events[events.length - 1]!;
    expect(lastEvent.type).toBe("done");
  });

  it("emits done even for empty stream", async () => {
    const events = await collectEvents(mockDualStream([]));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("done");
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
    expect(textDeltas[0]!.textDelta).toBe("Real content");
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
    expect(textDeltas[0]!.textDelta).toBe("With node");
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
    expect(textDeltas[0]!.textDelta).toBe("Which sport are you asking about?");
  });

  it("does not duplicate answer when synthesizer tokens are present", async () => {
    // When synthesizer streams tokens, values-mode answer is suppressed
    // (buffer is non-empty so the values-mode guard blocks it)
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "Hello" }, { langgraph_node: "synthesizer" }]],
        [
          "messages",
          [{ content: " world" }, { langgraph_node: "synthesizer" }],
        ],
        ["values", { answer: "Hello world" }], // Should be ignored
      ]),
    );

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(2);
    expect(textDeltas[0]!.textDelta).toBe("Hello");
    expect(textDeltas[1]!.textDelta).toBe(" world");
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
    expect(textDeltas[0]!.textDelta).toBe("Please contact ");
    expect(textDeltas[1]!.textDelta).toBe("SafeSport");
  });

  it("emits disclaimer event from values mode when disclaimer field is set", async () => {
    const events = await collectEvents(
      mockDualStream([
        [
          "messages",
          [{ content: "Good answer" }, { langgraph_node: "synthesizer" }],
        ],
        [
          "values",
          {
            answer: "Good answer",
            qualityCheckResult: {
              passed: true,
              score: 0.9,
              issues: [],
              critique: "",
            },
          },
        ],
        // DisclaimerGuard sets structured disclaimer
        [
          "values",
          {
            disclaimer: "This information is for general guidance only.",
          },
        ],
      ]),
    );

    const disclaimerEvents = events.filter((e) => e.type === "disclaimer");
    expect(disclaimerEvents).toHaveLength(1);
    expect(disclaimerEvents[0]!.disclaimer).toBe(
      "This information is for general guidance only.",
    );

    // Answer should not include disclaimer text
    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0]!.textDelta).toBe("Good answer");
  });

  it("does not emit duplicate disclaimer events", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["values", { disclaimer: "Not legal advice." }],
        ["values", { disclaimer: "Not legal advice." }],
      ]),
    );

    const disclaimerEvents = events.filter((e) => e.type === "disclaimer");
    expect(disclaimerEvents).toHaveLength(1);
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

    // Buffered tokens should be flushed before the error
    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0]!.textDelta).toBe("Hello");

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]!.error?.message).toBe("Stream broke");
    expect(errorEvents[0]!.error?.code).toBe("GRAPH_ERROR");

    // Text delta should come before error
    const types = events.map((e) => e.type);
    expect(types.indexOf("text-delta")).toBeLessThan(types.indexOf("error"));

    // Should still emit done after error
    const lastEvent = events[events.length - 1]!;
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
    expect(errorEvents[0]!.error?.code).toBe("GRAPH_TIMEOUT");
    expect(errorEvents[0]!.error?.message).toContain("timed out");
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
    expect(errorEvents[0]!.error?.code).toBe("RETRIEVAL_ERROR");
  });

  it("does not emit answer-reset (no longer used with buffer approach)", async () => {
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
            answer: "Generic answer",
            qualityRetryCount: 0,
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
    expect(types).not.toContain("answer-reset");
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
    expect(discoveredEvents[0]!.discoveredUrls).toEqual(discoveredUrls);

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

    expect(events[events.length - 1]!.type).toBe("done");
  });

  it("does not process stale quality check results from cumulative state", async () => {
    // After quality check fails and synthesizer retries, values chunks from
    // the retry synthesizer still include the old qualityCheckResult.
    // The adapter should NOT re-process the stale result.
    const events = await collectEvents(
      mockDualStream([
        // First synthesizer
        [
          "messages",
          [{ content: "Generic " }, { langgraph_node: "synthesizer" }],
        ],
        [
          "messages",
          [{ content: "answer" }, { langgraph_node: "synthesizer" }],
        ],
        // Quality check fails
        [
          "values",
          {
            answer: "Generic answer",
            qualityRetryCount: 0,
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
        // Retry synthesizer — values chunk still has old qualityCheckResult
        [
          "messages",
          [{ content: "Specific " }, { langgraph_node: "synthesizer" }],
        ],
        [
          "messages",
          [{ content: "answer " }, { langgraph_node: "synthesizer" }],
        ],
        [
          "values",
          {
            answer: "Specific answer here",
            qualityRetryCount: 1,
            // Stale qualityCheckResult from first check
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
        ["messages", [{ content: "here" }, { langgraph_node: "synthesizer" }]],
        // Fresh quality check passes
        [
          "values",
          {
            answer: "Specific answer here",
            qualityRetryCount: 1,
            qualityCheckResult: {
              passed: true,
              score: 0.85,
              issues: [],
              critique: "",
            },
          },
        ],
      ]),
    );

    // Only retry tokens (not the discarded first set)
    const textDeltas = events.filter((e) => e.type === "text-delta");
    const combined = textDeltas.map((e) => e.textDelta).join("");
    expect(combined).toBe("Specific answer here");
    expect(combined).not.toContain("Generic");
  });

  // ---------------------------------------------------------------------------
  // Status event tests
  // ---------------------------------------------------------------------------

  it("emits status event when first messages chunk arrives from classifier", async () => {
    const events = await collectEvents(
      mockDualStream([
        [
          "messages",
          [
            { content: '{"topicDomain":"safesport"}' },
            { langgraph_node: "classifier" },
          ],
        ],
      ]),
    );

    const statusEvents = events.filter((e) => e.type === "status");
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0]!.status).toBe("Understanding your question...");
  });

  it("emits new status when node changes (classifier → synthesizer)", async () => {
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
          [{ content: "Answer" }, { langgraph_node: "synthesizer" }],
        ],
      ]),
    );

    const statusEvents = events.filter((e) => e.type === "status");
    expect(statusEvents).toHaveLength(2);
    expect(statusEvents[0]!.status).toBe("Understanding your question...");
    expect(statusEvents[1]!.status).toBe("Preparing your answer...");
  });

  it("does not emit duplicate status for same node", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "chunk1" }, { langgraph_node: "classifier" }]],
        ["messages", [{ content: "chunk2" }, { langgraph_node: "classifier" }]],
      ]),
    );

    const statusEvents = events.filter((e) => e.type === "status");
    expect(statusEvents).toHaveLength(1);
  });

  it("does not emit status for nodes without labels (emotionalSupport)", async () => {
    const events = await collectEvents(
      mockDualStream([
        [
          "messages",
          [{ content: "support" }, { langgraph_node: "emotionalSupport" }],
        ],
      ]),
    );

    const statusEvents = events.filter((e) => e.type === "status");
    expect(statusEvents).toHaveLength(0);
  });

  it("does not emit status for nodes without labels (citationBuilder)", async () => {
    const events = await collectEvents(
      mockDualStream([
        [
          "messages",
          [{ content: "cite" }, { langgraph_node: "citationBuilder" }],
        ],
      ]),
    );

    const statusEvents = events.filter((e) => e.type === "status");
    expect(statusEvents).toHaveLength(0);
  });

  it("emits retriever status from values mode when retrievedDocuments first appears", async () => {
    const events = await collectEvents(
      mockDualStream([
        ["messages", [{ content: "{}" }, { langgraph_node: "classifier" }]],
        [
          "values",
          {
            retrievedDocuments: [
              { content: "doc content", metadata: {}, score: 0.9 },
            ],
          },
        ],
      ]),
    );

    const statusEvents = events.filter((e) => e.type === "status");
    expect(statusEvents).toHaveLength(2);
    expect(statusEvents[0]!.status).toBe("Understanding your question...");
    expect(statusEvents[1]!.status).toBe("Searching governance documents...");
  });

  it("does not emit status after synthesizer buffer has been flushed", async () => {
    const events = await collectEvents(
      mockDualStream([
        // Synthesizer streams tokens (buffered)
        [
          "messages",
          [{ content: "Answer" }, { langgraph_node: "synthesizer" }],
        ],
        // Quality passes → buffer flushed
        [
          "values",
          {
            answer: "Answer",
            qualityCheckResult: {
              passed: true,
              score: 0.9,
              issues: [],
              critique: "",
            },
          },
        ],
        // Quality checker messages should NOT emit status (buffer flushed)
        [
          "messages",
          [{ content: "check" }, { langgraph_node: "qualityChecker" }],
        ],
      ]),
    );

    const statusEvents = events.filter((e) => e.type === "status");
    // Only the initial synthesizer status should appear
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0]!.status).toBe("Preparing your answer...");
  });

  it("re-emits synthesizer status after quality check failure triggers retry", async () => {
    const events = await collectEvents(
      mockDualStream([
        // First synthesizer
        [
          "messages",
          [{ content: "Generic" }, { langgraph_node: "synthesizer" }],
        ],
        // Quality fails
        [
          "values",
          {
            answer: "Generic",
            qualityRetryCount: 0,
            qualityCheckResult: {
              passed: false,
              score: 0.3,
              issues: [],
              critique: "Be specific",
            },
          },
        ],
        // Retry synthesizer — should re-emit status
        [
          "messages",
          [{ content: "Specific" }, { langgraph_node: "synthesizer" }],
        ],
      ]),
    );

    const statusEvents = events.filter((e) => e.type === "status");
    const synthStatuses = statusEvents.filter(
      (e) => e.status === "Preparing your answer...",
    );
    // Should have two synthesizer status events (initial + retry)
    expect(synthStatuses).toHaveLength(2);
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
    expect(textDeltas[0]!.textDelta).toBe("Partial ");
    expect(textDeltas[1]!.textDelta).toBe("response");

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);

    expect(events[events.length - 1]!.type).toBe("done");
  });
});
