import { describe, it, expect, vi, beforeEach } from "vitest";

// Track calls to initRunner logic via the mocked @usopc/shared
let shouldFailInit = false;
let initCallCount = 0;

vi.mock("@usopc/shared", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
    })),
  },
  getDatabaseUrl: vi.fn(() => {
    initCallCount++;
    if (shouldFailInit) throw new Error("Missing DATABASE_URL");
    return "postgres://localhost/test";
  }),
  getSecretValue: vi.fn(() => "test-key"),
  getOptionalEnv: vi.fn(() => undefined),
}));

vi.mock("@usopc/core", () => ({
  AgentRunner: {
    create: vi.fn(async () => ({
      stream: vi.fn(),
    })),
    convertMessages: vi.fn(() => []),
  },
  agentStreamToEvents: vi.fn(() => ({
    [Symbol.asyncIterator]: () => ({
      next: vi.fn(async () => ({ done: true, value: undefined })),
    }),
  })),
  getFeatureFlags: vi.fn(() => ({ conversationMemory: false })),
  loadSummary: vi.fn(),
  saveSummary: vi.fn(),
  generateSummary: vi.fn(),
}));

vi.mock("ai", () => ({
  createDataStreamResponse: vi.fn(({ execute }) => {
    // Execute the writer callback to exercise the code path
    const mockWriter = { write: vi.fn() };
    execute(mockWriter);
    return new Response("stream", { status: 200 });
  }),
  formatDataStreamPart: vi.fn(
    (type: string, data: unknown) => `${type}:${data}`,
  ),
}));

describe("POST /api/chat", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    shouldFailInit = false;
    initCallCount = 0;
    // Reset the module to clear the cached runnerPromise
    vi.resetModules();
  });

  it("returns 500 with generic message when runner init fails", async () => {
    shouldFailInit = true;

    const { POST } = await import("./route.js");
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [], userSport: "swimming" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Something went wrong. Please try again.");
    // Should not leak stack traces
    expect(body.stack).toBeUndefined();
  });

  it("clears cached runner after failure so next call retries", async () => {
    shouldFailInit = true;

    const { POST } = await import("./route.js");

    // First request fails
    const req1 = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req1);
    const countAfterFirst = initCallCount;

    // Second request should retry (not serve cached rejection)
    const req2 = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req2);

    expect(initCallCount).toBeGreaterThan(countAfterFirst);
  });

  it("returns 500 on malformed request body", async () => {
    const { POST } = await import("./route.js");
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Something went wrong. Please try again.");
  });
});
