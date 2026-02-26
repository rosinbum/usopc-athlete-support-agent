/**
 * Integration test for POST /api/chat
 *
 * Exercises the real `agentStreamToEvents` adapter to verify UI message stream
 * output end-to-end. Only the transport layer (runner, auth, DB, SQS) is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StreamChunk } from "@usopc/core";

// ---------------------------------------------------------------------------
// Shared mock state (hoisted so vi.mock closures can reference it)
// ---------------------------------------------------------------------------
const {
  capturedWrites,
  mockRunnerStream,
  mockWriter,
  mockLoadSummary,
  mockSaveSummary,
  mockGenerateSummary,
  mockPublishDiscoveredUrls,
  executePromise,
} = vi.hoisted(() => {
  const capturedWrites: unknown[] = [];
  const mockRunnerStream = vi.fn();
  const mockWriter = {
    write: vi.fn((v: unknown) => capturedWrites.push(v)),
    merge: vi.fn(),
  };
  const mockLoadSummary = vi.fn();
  const mockSaveSummary = vi.fn();
  const mockGenerateSummary = vi.fn();
  const mockPublishDiscoveredUrls = vi.fn();
  // Store the execute() promise so tests can await stream completion
  const executePromise: { current: Promise<void> | null } = { current: null };
  return {
    capturedWrites,
    mockRunnerStream,
    mockWriter,
    mockLoadSummary,
    mockSaveSummary,
    mockGenerateSummary,
    mockPublishDiscoveredUrls,
    executePromise,
  };
});

// ---------------------------------------------------------------------------
// Helper: build an async generator from an array of StreamChunks
// ---------------------------------------------------------------------------
async function* fakeStream(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const c of chunks) yield c;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Include AppError — streamAdapter.ts imports it for instanceof checks
vi.mock("@usopc/shared", () => {
  class AppError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    AppError,
    logger: {
      child: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
    },
    getResource: vi.fn((key: string) => {
      if (key === "DiscoveryFeedQueue")
        return { url: "https://sqs.us-east-1.amazonaws.com/test-queue" };
      throw new Error(`SST Resource '${key}' not available`);
    }),
    getDatabaseUrl: vi.fn(() => "postgres://localhost/test"),
    getSecretValue: vi.fn(() => "test-key"),
    getOptionalEnv: vi.fn(() => undefined),
    createConversationSummaryEntity: vi.fn(() => ({})),
  };
});

vi.mock("../../../auth.js", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { email: "test@example.com", role: "athlete" },
  }),
}));

vi.mock("sst", () => ({
  Resource: {
    DiscoveryFeedQueue: {
      url: "https://sqs.us-east-1.amazonaws.com/test-queue",
    },
  },
}));

// Import real agentStreamToEvents directly from source (bypasses @usopc/core
// barrel which pulls heavy LangChain deps that break importOriginal).
vi.mock("@usopc/core", async () => {
  const { agentStreamToEvents } =
    await import("../../../../../packages/core/src/agent/streamAdapter.js");
  return {
    agentStreamToEvents,
    getAppRunner: vi.fn(async () => ({
      stream: mockRunnerStream,
      classifierModel: {},
    })),
    AgentRunner: {
      convertMessages: vi.fn((msgs: unknown[]) => msgs),
    },
    loadSummary: mockLoadSummary,
    saveSummary: mockSaveSummary,
    generateSummary: mockGenerateSummary,
    publishDiscoveredUrls: mockPublishDiscoveredUrls,
    detectInjection: vi.fn().mockReturnValue(null),
    INJECTION_RESPONSE: "Please rephrase your question.",
  };
});

// Mock createUIMessageStream to capture writer calls
vi.mock("ai", () => ({
  createUIMessageStream: vi.fn(
    ({
      execute,
    }: {
      execute: (ctx: { writer: typeof mockWriter }) => Promise<void>;
    }) => {
      executePromise.current = execute({ writer: mockWriter });
      return new ReadableStream();
    },
  ),
  createUIMessageStreamResponse: vi.fn(
    () => new Response("stream", { status: 200 }),
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function importRoute() {
  return import("./route.js");
}

function makePOSTRequest(body: object) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Wait for the execute callback (async generator iteration) to complete. */
async function waitForStream() {
  if (executePromise.current) {
    await executePromise.current;
  }
}

/** Extra ticks for fire-and-forget .then() chains. */
async function waitForFireAndForget() {
  await waitForStream();
  await new Promise((r) => setTimeout(r, 20));
}

const simpleBody = {
  messages: [{ role: "user", content: "Hello" }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Chat route integration (real stream adapter + UI message stream)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // In-place clear — hoisted ref is captured by closure
    capturedWrites.length = 0;
    executePromise.current = null;
    mockLoadSummary.mockResolvedValue(undefined);
    mockSaveSummary.mockResolvedValue(undefined);
    mockGenerateSummary.mockResolvedValue("summary");
    mockPublishDiscoveredUrls.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------
  // 1. Text streaming from synthesizer
  // -------------------------------------------------------------------
  describe("text streaming from synthesizer", () => {
    it("emits text-start, text-delta, and text-end parts", async () => {
      const chunks: StreamChunk[] = [
        ["messages", [{ content: "Hello" }, { langgraph_node: "synthesizer" }]],
        [
          "messages",
          [{ content: " world" }, { langgraph_node: "synthesizer" }],
        ],
      ];
      mockRunnerStream.mockReturnValue(fakeStream(chunks));

      const { POST } = await importRoute();
      await POST(makePOSTRequest(simpleBody));
      await waitForStream();

      expect(capturedWrites).toContainEqual(
        expect.objectContaining({ type: "text-start" }),
      );
      expect(capturedWrites).toContainEqual(
        expect.objectContaining({ type: "text-delta", delta: "Hello" }),
      );
      expect(capturedWrites).toContainEqual(
        expect.objectContaining({ type: "text-delta", delta: " world" }),
      );
      expect(capturedWrites).toContainEqual(
        expect.objectContaining({ type: "text-end" }),
      );
    });
  });

  // -------------------------------------------------------------------
  // 2. Citations in stream
  // -------------------------------------------------------------------
  describe("citations in stream", () => {
    it("emits data-citations part for citations", async () => {
      const citations = [
        {
          title: "Doc A",
          url: "https://example.com/a",
          documentType: "policy",
          snippet: "relevant text",
        },
      ];
      const chunks: StreamChunk[] = [["values", { citations }]];
      mockRunnerStream.mockReturnValue(fakeStream(chunks));

      const { POST } = await importRoute();
      await POST(makePOSTRequest(simpleBody));
      await waitForStream();

      expect(capturedWrites).toContainEqual(
        expect.objectContaining({
          type: "data-citations",
          data: { type: "citations", citations },
        }),
      );
    });
  });

  // -------------------------------------------------------------------
  // 3. Stream error
  // -------------------------------------------------------------------
  describe("stream error", () => {
    it("emits error part and preserves preceding text", async () => {
      async function* errorStream(): AsyncGenerator<StreamChunk> {
        yield [
          "messages",
          [{ content: "Partial" }, { langgraph_node: "synthesizer" }],
        ];
        throw new Error("boom");
      }
      mockRunnerStream.mockReturnValue(errorStream());

      const { POST } = await importRoute();
      await POST(makePOSTRequest(simpleBody));
      await waitForStream();

      // Text before error is preserved
      expect(capturedWrites).toContainEqual(
        expect.objectContaining({ type: "text-delta", delta: "Partial" }),
      );
      // Error part
      expect(capturedWrites).toContainEqual(
        expect.objectContaining({ type: "error", errorText: "boom" }),
      );
    });
  });

  // -------------------------------------------------------------------
  // 4. Quality retry (buffer-based — no answer-reset)
  // -------------------------------------------------------------------
  describe("quality retry with token buffering", () => {
    it("discards first buffer and only emits retry tokens", async () => {
      const chunks: StreamChunk[] = [
        // First synthesizer pass (buffered, then discarded)
        ["messages", [{ content: "Draft" }, { langgraph_node: "synthesizer" }]],
        // Quality check fails (retryCount=0 < maxRetries=1 → retry coming)
        [
          "values",
          {
            answer: "Draft",
            qualityRetryCount: 0,
            qualityCheckResult: {
              passed: false,
              score: 0.3,
              issues: [
                {
                  type: "incomplete" as const,
                  description: "too short",
                  severity: "major" as const,
                },
              ],
              critique: "too short",
            },
          },
        ],
        // Retry synthesizer pass (buffered, then flushed at stream end)
        [
          "messages",
          [{ content: "Better answer" }, { langgraph_node: "synthesizer" }],
        ],
      ];
      mockRunnerStream.mockReturnValue(fakeStream(chunks));

      const { POST } = await importRoute();
      await POST(makePOSTRequest(simpleBody));
      await waitForStream();

      // Draft tokens should NOT appear (buffer was discarded)
      const textDeltas = capturedWrites.filter(
        (w) =>
          typeof w === "object" &&
          w !== null &&
          (w as { type: string }).type === "text-delta",
      );
      const deltaTexts = textDeltas.map((w) => (w as { delta: string }).delta);
      expect(deltaTexts).not.toContain("Draft");
      // Only retry text appears
      expect(deltaTexts).toContain("Better answer");
    });
  });

  // -------------------------------------------------------------------
  // 5. Non-LLM answer (clarification)
  // -------------------------------------------------------------------
  describe("non-LLM answer (clarification)", () => {
    it("emits text-delta from values-mode answer", async () => {
      const chunks: StreamChunk[] = [
        ["values", { answer: "Could you clarify which sport you mean?" }],
      ];
      mockRunnerStream.mockReturnValue(fakeStream(chunks));

      const { POST } = await importRoute();
      await POST(makePOSTRequest(simpleBody));
      await waitForStream();

      const textDeltas = capturedWrites.filter(
        (w) =>
          typeof w === "object" &&
          w !== null &&
          (w as { type: string }).type === "text-delta",
      );
      const deltaTexts = textDeltas.map((w) => (w as { delta: string }).delta);
      expect(deltaTexts.join("")).toContain(
        "Could you clarify which sport you mean?",
      );
    });
  });

  // -------------------------------------------------------------------
  // 6. Conversation summary loading
  // -------------------------------------------------------------------
  describe("conversation summary loading", () => {
    it("loads and passes summary to runner.stream()", async () => {
      const convId = "123e4567-e89b-12d3-a456-426614174000";
      mockLoadSummary.mockResolvedValue("prior summary");
      mockRunnerStream.mockReturnValue(fakeStream([]));

      const { POST } = await importRoute();
      await POST(
        makePOSTRequest({
          messages: [{ role: "user", content: "Hello" }],
          conversationId: convId,
        }),
      );
      await waitForStream();

      expect(mockLoadSummary).toHaveBeenCalledWith(
        `test@example.com:${convId}`,
      );
      expect(mockRunnerStream).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationSummary: "prior summary",
          userId: "test@example.com",
        }),
      );
    });
  });

  // -------------------------------------------------------------------
  // 7. Discovered URLs fire-and-forget
  // -------------------------------------------------------------------
  describe("discovered URLs fire-and-forget", () => {
    it("publishes URLs to SQS queue", async () => {
      const urls = [
        {
          url: "https://example.com",
          title: "Example",
          content: "...",
          score: 0.9,
        },
      ];
      const chunks: StreamChunk[] = [["values", { webSearchResultUrls: urls }]];
      mockRunnerStream.mockReturnValue(fakeStream(chunks));

      const { POST } = await importRoute();
      await POST(makePOSTRequest(simpleBody));
      await waitForFireAndForget();

      expect(mockPublishDiscoveredUrls).toHaveBeenCalledWith(
        urls,
        "https://sqs.us-east-1.amazonaws.com/test-queue",
      );
    });
  });

  // -------------------------------------------------------------------
  // 8. Summary save (now automatic inside runner.stream())
  // -------------------------------------------------------------------
  describe("summary save", () => {
    it("does not call generateSummary/saveSummary from the route (handled by runner)", async () => {
      const convId = "123e4567-e89b-12d3-a456-426614174000";
      mockRunnerStream.mockReturnValue(fakeStream([]));

      const { POST } = await importRoute();
      await POST(
        makePOSTRequest({
          messages: [{ role: "user", content: "Hello" }],
          conversationId: convId,
        }),
      );
      await waitForFireAndForget();

      // Summary save moved into AgentRunner.stream() — route no longer calls these
      expect(mockGenerateSummary).not.toHaveBeenCalled();
      expect(mockSaveSummary).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // 9. Status events
  // -------------------------------------------------------------------
  describe("status events", () => {
    it("emits data-status part for status events", async () => {
      const chunks: StreamChunk[] = [
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
      ];
      mockRunnerStream.mockReturnValue(fakeStream(chunks));

      const { POST } = await importRoute();
      await POST(makePOSTRequest(simpleBody));
      await waitForStream();

      const statusWrites = capturedWrites.filter(
        (w) =>
          typeof w === "object" &&
          w !== null &&
          (w as { type: string }).type === "data-status",
      );
      expect(statusWrites.length).toBeGreaterThanOrEqual(1);

      // First status should be classifier
      const firstStatus = statusWrites[0] as {
        type: string;
        data: { type: string; status: string };
      };
      expect(firstStatus.data).toEqual({
        type: "status",
        status: "Understanding your question...",
      });
    });
  });

  // -------------------------------------------------------------------
  // 10. No discovered URLs
  // -------------------------------------------------------------------
  describe("no discovered URLs", () => {
    it("does not call publishDiscoveredUrls for empty stream", async () => {
      mockRunnerStream.mockReturnValue(fakeStream([]));

      const { POST } = await importRoute();
      await POST(makePOSTRequest(simpleBody));
      await waitForFireAndForget();

      expect(mockPublishDiscoveredUrls).not.toHaveBeenCalled();
    });
  });
});
