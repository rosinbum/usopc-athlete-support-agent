import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn().mockResolvedValue({
    user: { email: "test@example.com", role: "athlete" },
  }),
}));

// Track calls to getAppRunner via the mocked @usopc/core
let shouldFailInit = false;
let initCallCount = 0;

const mockRunner = {
  stream: vi.fn(),
  classifierModel: {},
};

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
}));

vi.mock("@usopc/core", () => ({
  getAppRunner: vi.fn(async () => {
    initCallCount++;
    if (shouldFailInit) throw new Error("Missing DATABASE_URL");
    return mockRunner;
  }),
  AgentRunner: {
    convertMessages: vi.fn(() => []),
  },
  agentStreamToEvents: vi.fn(() => ({
    [Symbol.asyncIterator]: () => ({
      next: vi.fn(async () => ({ done: true, value: undefined })),
    }),
  })),
  loadSummary: vi.fn(),
  publishDiscoveredUrls: vi.fn(),
}));

vi.mock("../../../auth.js", () => ({
  auth: mockAuth,
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

async function importRoute() {
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

  it("returns 500 with generic message when runner init fails", async () => {
    shouldFailInit = true;

    const { POST } = await importRoute();
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

  it("returns 500 on malformed request body", async () => {
    const { POST } = await importRoute();
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

  it("returns 400 when messages array is empty", async () => {
    const { POST } = await importRoute();
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
    const { POST } = await importRoute();
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
    const { POST } = await importRoute();
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
    const { POST } = await importRoute();
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
    const { POST } = await importRoute();
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
    const { POST } = await importRoute();
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
    const { POST } = await importRoute();
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

describe("rate limiting", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    shouldFailInit = false;
    initCallCount = 0;
    vi.resetModules();
  });

  it("returns 429 when rate limit exceeded", async () => {
    const { POST } = await importRoute();

    // Exhaust the per-IP rate limit (20 requests)
    for (let i = 0; i < 20; i++) {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "1.2.3.4",
        },
      });
      await POST(req);
    }

    // 21st request should be rate limited
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "1.2.3.4",
      },
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe("Too many requests");
  });

  it("tracks IPs independently for rate limiting", async () => {
    const { POST } = await importRoute();

    // Exhaust per-IP limit for one IP
    for (let i = 0; i < 20; i++) {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "1.2.3.4",
        },
      });
      await POST(req);
    }

    // Different IP should still work
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "5.6.7.8",
      },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
  });
});

describe("concurrent runner initialization", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    shouldFailInit = false;
    initCallCount = 0;
    vi.resetModules();
  });

  it("calls getAppRunner for each request (caching is in the factory)", async () => {
    const { POST } = await importRoute();

    const makeReq = () =>
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
        headers: { "Content-Type": "application/json" },
      });

    // First request
    const res1 = await POST(makeReq());
    expect(res1.status).toBe(200);

    // Second request
    const res2 = await POST(makeReq());
    expect(res2.status).toBe(200);

    // getAppRunner is called for each request; caching happens inside the factory
    expect(initCallCount).toBe(2);
  });
});

describe("authentication (SEC-04)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    shouldFailInit = false;
    initCallCount = 0;
    vi.resetModules();
  });

  it("returns 401 when no session exists", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const { POST } = await importRoute();
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no email", async () => {
    mockAuth.mockResolvedValueOnce({ user: { role: "athlete" } });

    const { POST } = await importRoute();
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("proceeds when session is valid", async () => {
    const { POST } = await importRoute();
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
