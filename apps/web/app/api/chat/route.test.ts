import { describe, it, expect, vi, beforeEach } from "vitest";

// Track calls to initRunner logic via the mocked @usopc/shared
let shouldFailInit = false;
let initCallCount = 0;

vi.mock("../../../auth.js", () => ({
  auth: vi.fn(),
}));

vi.mock("@usopc/shared", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
    })),
  },
  getResource: vi.fn((key: string) => {
    if (key === "DiscoveryFeedQueue")
      return { url: "https://sqs.us-east-1.amazonaws.com/test-queue" };
    throw new Error(`SST Resource '${key}' not available`);
  }),
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
  loadSummary: vi.fn(),
  saveSummary: vi.fn(),
  generateSummary: vi.fn(async () => ""),
  publishDiscoveredUrls: vi.fn(),
}));

vi.mock("sst", () => ({
  Resource: {
    DiscoveryFeedQueue: {
      url: "https://sqs.us-east-1.amazonaws.com/test-queue",
    },
  },
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

async function importWithAuth(session: unknown) {
  const { auth } = await import("../../../auth.js");
  vi.mocked(auth).mockResolvedValue(
    session as Awaited<ReturnType<typeof auth>>,
  );
  return import("./route.js");
}

describe("POST /api/chat", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    shouldFailInit = false;
    initCallCount = 0;
    // Reset the module to clear the cached runnerPromise
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    const { POST } = await importWithAuth(null);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 500 with generic message when runner init fails", async () => {
    shouldFailInit = true;

    const { POST } = await importWithAuth({
      user: { email: "test@example.com" },
    });
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
        userSport: "swimming",
      }),
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

    const { POST } = await importWithAuth({
      user: { email: "test@example.com" },
    });

    // First request fails
    const req1 = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req1);
    const countAfterFirst = initCallCount;

    // Second request should retry (not serve cached rejection)
    const req2 = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req2);

    expect(initCallCount).toBeGreaterThan(countAfterFirst);
  });

  it("returns 500 on malformed request body", async () => {
    const { POST } = await importWithAuth({
      user: { email: "test@example.com" },
    });
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

describe("input validation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    shouldFailInit = false;
    initCallCount = 0;
    vi.resetModules();
  });

  const session = { user: { email: "test@example.com" } };

  it("returns 400 when messages array is empty", async () => {
    const { POST } = await importWithAuth(session);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 when messages array exceeds 50 entries", async () => {
    const { POST } = await importWithAuth(session);
    const messages = Array.from({ length: 51 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "Hello",
    }));
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 when message content exceeds 10,000 chars", async () => {
    const { POST } = await importWithAuth(session);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "a".repeat(10_001) }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 when message role is invalid", async () => {
    const { POST } = await importWithAuth(session);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "system", content: "You are a helpful assistant." }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 when conversationId is not a UUID", async () => {
    const { POST } = await importWithAuth(session);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
        conversationId: "not-a-uuid",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request");
  });

  it("returns 200 when conversationId is a valid UUID", async () => {
    const { POST } = await importWithAuth(session);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
        conversationId: "123e4567-e89b-12d3-a456-426614174000",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it("returns 200 when messages are within limits", async () => {
    const { POST } = await importWithAuth(session);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "a".repeat(10_000) }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});
