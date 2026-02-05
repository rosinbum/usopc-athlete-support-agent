import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@usopc/shared", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

// Import after mocks
import {
  fetchWithRetry,
  FetchWithRetryError,
  type FetchWithRetryOptions,
} from "./fetchWithRetry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockResponse(status: number, body: string = ""): Response {
  return new Response(body, {
    status,
    statusText: status === 200 ? "OK" : `Error ${status}`,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchWithRetry", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("success scenarios", () => {
    it("returns response on first successful attempt", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, "success"));

      const promise = fetchWithRetry("https://example.com/doc.pdf");
      await vi.runAllTimersAsync();
      const response = await promise;

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("success");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("succeeds after transient 503 failure", async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(503))
        .mockResolvedValueOnce(createMockResponse(200, "success"));

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        initialDelayMs: 100,
      });
      await vi.runAllTimersAsync();
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("succeeds after network error then success", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValueOnce(createMockResponse(200, "success"));

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        initialDelayMs: 100,
      });
      await vi.runAllTimersAsync();
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("succeeds after 429 rate limit then success", async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(429))
        .mockResolvedValueOnce(createMockResponse(200, "success"));

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        initialDelayMs: 100,
      });
      await vi.runAllTimersAsync();
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("non-retryable failures", () => {
    it("fails immediately on 400 Bad Request", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(400));

      const promise = fetchWithRetry("https://example.com/doc.pdf");
      const assertion = expect(promise).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(FetchWithRetryError);
        expect((error as FetchWithRetryError).message).toContain("400");
        return true;
      });
      await vi.runAllTimersAsync();
      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("fails immediately on 401 Unauthorized", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(401));

      const promise = fetchWithRetry("https://example.com/doc.pdf");
      const assertion = expect(promise).rejects.toThrow(FetchWithRetryError);
      await vi.runAllTimersAsync();
      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("fails immediately on 403 Forbidden", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(403));

      const promise = fetchWithRetry("https://example.com/doc.pdf");
      const assertion = expect(promise).rejects.toThrow(FetchWithRetryError);
      await vi.runAllTimersAsync();
      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("fails immediately on 404 Not Found", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(404));

      const promise = fetchWithRetry("https://example.com/doc.pdf");
      const assertion = expect(promise).rejects.toThrow(FetchWithRetryError);
      await vi.runAllTimersAsync();
      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("max retries exceeded", () => {
    it("throws after exhausting all retries", async () => {
      // Use mockImplementation to return a fresh 503 response each time
      mockFetch.mockImplementation(() =>
        Promise.resolve(createMockResponse(503)),
      );

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        maxRetries: 3,
        initialDelayMs: 100,
      });
      const assertion = expect(promise).rejects.toThrow(FetchWithRetryError);
      await vi.runAllTimersAsync();
      await assertion;
      // Initial attempt + 3 retries = 4 total calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("throws after exhausting retries on network errors", async () => {
      mockFetch.mockImplementation(() =>
        Promise.reject(new Error("fetch failed")),
      );

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        maxRetries: 2,
        initialDelayMs: 100,
      });
      const assertion = expect(promise).rejects.toThrow(FetchWithRetryError);
      await vi.runAllTimersAsync();
      await assertion;
      // Initial attempt + 2 retries = 3 total calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("timeout handling", () => {
    it("aborts request after timeout", async () => {
      // Simulate a fetch that respects the abort signal
      mockFetch.mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              if (signal.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
              }
              signal.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
              });
            }
            // This would resolve after 120s, but will be aborted first
            setTimeout(() => resolve(createMockResponse(200)), 120_000);
          }),
      );

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        timeoutMs: 5000,
        maxRetries: 0,
        initialDelayMs: 100,
      });
      const assertion = expect(promise).rejects.toThrow(FetchWithRetryError);

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(6000);
      await assertion;
    });

    it("passes AbortSignal to fetch", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, "success"));

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        timeoutMs: 30000,
      });
      await vi.runAllTimersAsync();
      await promise;

      // Verify fetch was called with an AbortSignal
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/doc.pdf",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  describe("exponential backoff", () => {
    it("increases delay between retries", async () => {
      const delays: number[] = [];
      let lastCallTime = Date.now();

      mockFetch.mockImplementation(() => {
        const now = Date.now();
        if (mockFetch.mock.calls.length > 1) {
          delays.push(now - lastCallTime);
        }
        lastCallTime = now;

        // Return 503 for first 3 calls, then 200
        if (mockFetch.mock.calls.length < 4) {
          return Promise.resolve(createMockResponse(503));
        }
        return Promise.resolve(createMockResponse(200, "success"));
      });

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
      });
      await vi.runAllTimersAsync();
      await promise;

      // With exponential backoff: 1000, 2000, 4000 (approximate, jitter may vary)
      expect(delays.length).toBe(3);
      // First delay should be around initialDelayMs (with some jitter tolerance)
      expect(delays[0]).toBeGreaterThanOrEqual(500);
      expect(delays[0]).toBeLessThanOrEqual(1500);
      // Second delay should be roughly 2x first
      expect(delays[1]).toBeGreaterThanOrEqual(1000);
      // Third delay should be roughly 2x second
      expect(delays[2]).toBeGreaterThanOrEqual(2000);
    });

    it("caps delay at maxDelayMs", async () => {
      const delays: number[] = [];
      let lastCallTime = Date.now();

      mockFetch.mockImplementation(() => {
        const now = Date.now();
        if (mockFetch.mock.calls.length > 1) {
          delays.push(now - lastCallTime);
        }
        lastCallTime = now;

        // Return 503 for first 5 calls, then 200
        if (mockFetch.mock.calls.length < 6) {
          return Promise.resolve(createMockResponse(503));
        }
        return Promise.resolve(createMockResponse(200, "success"));
      });

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 3000, // Cap at 3s
      });
      await vi.runAllTimersAsync();
      await promise;

      // All delays should be <= maxDelayMs + jitter tolerance
      for (const delay of delays) {
        expect(delay).toBeLessThanOrEqual(4500); // 3000 + 50% jitter tolerance
      }
    });
  });

  describe("retryable status codes", () => {
    const defaultRetryableCodes = [408, 429, 500, 502, 503, 504];

    for (const code of defaultRetryableCodes) {
      it(`retries on ${code} status`, async () => {
        mockFetch
          .mockResolvedValueOnce(createMockResponse(code))
          .mockResolvedValueOnce(createMockResponse(200, "success"));

        const promise = fetchWithRetry(
          "https://example.com/doc.pdf",
          undefined,
          {
            initialDelayMs: 100,
          },
        );
        await vi.runAllTimersAsync();
        const response = await promise;

        expect(response.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    }

    it("accepts custom retryable status codes", async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(418)) // I'm a teapot
        .mockResolvedValueOnce(createMockResponse(200, "success"));

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        retryableStatusCodes: [418],
        initialDelayMs: 100,
      });
      await vi.runAllTimersAsync();
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("request options passthrough", () => {
    it("passes custom headers to fetch", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, "success"));

      const promise = fetchWithRetry("https://example.com/doc.pdf", {
        headers: {
          "User-Agent": "USOPC-Ingestion/1.0",
          Accept: "application/pdf",
        },
      });
      await vi.runAllTimersAsync();
      await promise;

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/doc.pdf",
        expect.objectContaining({
          headers: {
            "User-Agent": "USOPC-Ingestion/1.0",
            Accept: "application/pdf",
          },
        }),
      );
    });

    it("preserves method in request options", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, "success"));

      const promise = fetchWithRetry("https://example.com/doc.pdf", {
        method: "HEAD",
      });
      await vi.runAllTimersAsync();
      await promise;

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/doc.pdf",
        expect.objectContaining({
          method: "HEAD",
        }),
      );
    });
  });

  describe("error details", () => {
    it("includes URL in error message", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(404));

      const promise = fetchWithRetry("https://example.com/doc.pdf");
      const assertion = expect(promise).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(FetchWithRetryError);
        expect((error as FetchWithRetryError).message).toContain(
          "https://example.com/doc.pdf",
        );
        return true;
      });
      await vi.runAllTimersAsync();
      await assertion;
    });

    it("includes HTTP status in error for non-retryable responses", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(404));

      const promise = fetchWithRetry("https://example.com/doc.pdf");
      const assertion = expect(promise).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(FetchWithRetryError);
        expect((error as FetchWithRetryError).statusCode).toBe(404);
        return true;
      });
      await vi.runAllTimersAsync();
      await assertion;
    });

    it("includes attempt count in error after max retries", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(createMockResponse(503)),
      );

      const promise = fetchWithRetry("https://example.com/doc.pdf", undefined, {
        maxRetries: 2,
        initialDelayMs: 100,
      });
      const assertion = expect(promise).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(FetchWithRetryError);
        expect((error as FetchWithRetryError).attempts).toBe(3);
        return true;
      });
      await vi.runAllTimersAsync();
      await assertion;
    });
  });
});
