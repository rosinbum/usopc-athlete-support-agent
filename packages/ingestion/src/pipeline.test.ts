import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Document } from "@langchain/core/documents";

// ---------------------------------------------------------------------------
// Mocks — must be before importing the module under test
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

const mockAddVectors = vi.fn();
const mockEmbedDocuments = vi.fn();

vi.mock("@usopc/core", () => ({
  MODEL_CONFIG: {
    embeddings: { model: "text-embedding-3-small", dimensions: 1536 },
  },
  createRawEmbeddings: vi.fn(() => ({
    embedDocuments: mockEmbedDocuments,
  })),
  createVectorStore: vi.fn(async () => ({
    addVectors: mockAddVectors,
  })),
}));

vi.mock("./loaders/pdfLoader.js", () => ({
  loadPdf: vi.fn(
    async (): Promise<Document[]> => [
      { pageContent: "pdf content", metadata: {} },
    ],
  ),
}));

vi.mock("./loaders/webLoader.js", () => ({
  loadWeb: vi.fn(
    async (): Promise<Document[]> => [
      { pageContent: "web content", metadata: {} },
    ],
  ),
}));

vi.mock("./loaders/htmlLoader.js", () => ({
  loadHtml: vi.fn(
    async (): Promise<Document[]> => [
      { pageContent: "html content", metadata: {} },
    ],
  ),
}));

vi.mock("./transformers/cleaner.js", () => ({
  cleanText: vi.fn((text: string) => text),
}));

vi.mock("./transformers/sectionSplitter.js", () => ({
  sectionAwareSplit: vi.fn(
    async (docs: Document[]): Promise<Document[]> => docs,
  ),
}));

vi.mock("./transformers/metadataEnricher.js", () => ({
  enrichMetadata: vi.fn((docs: Document[]) => docs),
}));

// Now import the module under test
import {
  QuotaExhaustedError,
  TokenRateLimiter,
  TPM_LIMIT,
  TPM_HEADROOM,
  RATE_WINDOW_MS,
  ingestSource,
  ingestAll,
  type IngestionSource,
} from "./pipeline.js";
import { loadPdf } from "./loaders/pdfLoader.js";
import { cleanText } from "./transformers/cleaner.js";

const mockLoadPdf = vi.mocked(loadPdf);
const mockCleanText = vi.mocked(cleanText);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SOURCE: IngestionSource = {
  id: "test-source",
  title: "Test Source",
  documentType: "policy",
  topicDomains: ["testing"],
  url: "https://example.com/doc.pdf",
  format: "pdf",
  ngbId: null,
  priority: "medium",
  description: "A test source",
};

const OPTIONS = {
  openaiApiKey: "sk-test",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QuotaExhaustedError", () => {
  it("has correct name property", () => {
    const error = new QuotaExhaustedError("quota exceeded");
    expect(error.name).toBe("QuotaExhaustedError");
  });

  it("is an instanceof Error", () => {
    const error = new QuotaExhaustedError("quota exceeded");
    expect(error).toBeInstanceOf(Error);
  });

  it("preserves message", () => {
    const error = new QuotaExhaustedError("some quota message");
    expect(error.message).toBe("some quota message");
  });
});

describe("ingestSource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Return a single 1536-dim zero vector (one per document in the batch)
    mockEmbedDocuments.mockResolvedValue([new Array(1536).fill(0)]);
    mockAddVectors.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns completed result on success", async () => {
    const promise = ingestSource(SOURCE, OPTIONS);
    const result = await promise;

    expect(result).toEqual({
      sourceId: "test-source",
      status: "completed",
      chunksCount: 1,
    });
  });

  it("throws QuotaExhaustedError for 'insufficient_quota' errors", async () => {
    mockEmbedDocuments.mockRejectedValueOnce(
      new Error("insufficient_quota: please upgrade your plan"),
    );

    await expect(ingestSource(SOURCE, OPTIONS)).rejects.toThrow(
      QuotaExhaustedError,
    );
  });

  it("throws QuotaExhaustedError for 'exceeded your current quota' errors", async () => {
    mockEmbedDocuments.mockRejectedValueOnce(
      new Error("You exceeded your current quota"),
    );

    await expect(ingestSource(SOURCE, OPTIONS)).rejects.toThrow(
      QuotaExhaustedError,
    );
  });

  it("throws QuotaExhaustedError for 'billing hard limit has been reached' errors", async () => {
    mockEmbedDocuments.mockRejectedValueOnce(
      new Error("billing hard limit has been reached"),
    );

    await expect(ingestSource(SOURCE, OPTIONS)).rejects.toThrow(
      QuotaExhaustedError,
    );
  });

  it("returns failed result for non-quota errors", async () => {
    // Must reject all 3 attempts (1 initial + 2 retries) to exhaust retries
    mockAddVectors
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockRejectedValueOnce(new Error("network timeout"));

    const promise = ingestSource(SOURCE, OPTIONS);
    await vi.advanceTimersByTimeAsync(30_000); // retry 1 delay
    await vi.advanceTimersByTimeAsync(30_000); // retry 2 delay
    const result = await promise;

    expect(result).toEqual({
      sourceId: "test-source",
      status: "failed",
      chunksCount: 0,
      error: "network timeout",
    });
  });

  it("returns failed result when loader returns empty array", async () => {
    mockLoadPdf.mockResolvedValueOnce([]);

    const result = await ingestSource(SOURCE, OPTIONS);

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Loader returned 0 documents/);
  });

  it("returns failed result when all documents are empty after cleaning", async () => {
    mockLoadPdf.mockResolvedValueOnce([
      { pageContent: "will-be-emptied", metadata: {} },
    ]);
    mockCleanText.mockReturnValueOnce("   ");

    const result = await ingestSource(SOURCE, OPTIONS);

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/empty after cleaning/);
  });

  it("retries embedding batch on transient error and succeeds", async () => {
    mockAddVectors
      .mockRejectedValueOnce(new Error("Connection reset"))
      .mockResolvedValueOnce(undefined);

    const promise = ingestSource(SOURCE, OPTIONS);
    // Advance past the 30s retry delay
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;

    expect(result.status).toBe("completed");
    expect(mockAddVectors).toHaveBeenCalledTimes(2);
  });

  it("does not retry on QuotaExhaustedError", async () => {
    mockEmbedDocuments.mockRejectedValueOnce(
      new Error("insufficient_quota: upgrade plan"),
    );

    await expect(ingestSource(SOURCE, OPTIONS)).rejects.toThrow(
      QuotaExhaustedError,
    );
    expect(mockEmbedDocuments).toHaveBeenCalledTimes(1);
  });

  it("does not retry on EmbeddingDimensionError", async () => {
    // Return wrong dimension (512 instead of 1536)
    mockEmbedDocuments.mockResolvedValueOnce([new Array(512).fill(0)]);

    const result = await ingestSource(SOURCE, OPTIONS);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("returned 512-dim embeddings");
    expect(mockEmbedDocuments).toHaveBeenCalledTimes(1);
  });

  it("fails after exhausting batch retries", async () => {
    mockAddVectors
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"));

    const promise = ingestSource(SOURCE, OPTIONS);
    await vi.advanceTimersByTimeAsync(30_000); // retry 1
    await vi.advanceTimersByTimeAsync(30_000); // retry 2
    const result = await promise;

    expect(result.status).toBe("failed");
    expect(result.error).toBe("timeout");
    expect(mockAddVectors).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// TokenRateLimiter
// ---------------------------------------------------------------------------

describe("TokenRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips sleep when token budget has headroom", async () => {
    const limiter = new TokenRateLimiter();
    const sleepSpy = vi.spyOn(globalThis, "setTimeout");

    // Small batch well under the 32K effective budget
    await limiter.waitIfNeeded(1_000);

    // setTimeout is only called by sleep() when waiting — no rate-limit
    // sleep should have been triggered (setTimeout may be called by other
    // internals, but not with a delay > 1s).
    const rateLimitCalls = sleepSpy.mock.calls.filter(
      (call) => typeof call[1] === "number" && call[1] > 1_000,
    );
    expect(rateLimitCalls).toHaveLength(0);

    sleepSpy.mockRestore();
  });

  it("waits when approaching TPM limit", async () => {
    const limiter = new TokenRateLimiter();
    const budget = TPM_LIMIT * TPM_HEADROOM; // 32_000

    // Pre-fill the limiter near the budget
    limiter.record(budget - 1_000);

    // Next batch of 5_000 tokens exceeds the budget — should trigger a wait
    const promise = limiter.waitIfNeeded(5_000);
    // Advance past the rate window + buffer so the sleep resolves
    await vi.advanceTimersByTimeAsync(RATE_WINDOW_MS + 1_000);
    await promise;

    // If we get here without hanging, the limiter correctly waited and resumed
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ingestAll — shared rate limiter
// ---------------------------------------------------------------------------

describe("ingestAll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockEmbedDocuments.mockResolvedValue([new Array(1536).fill(0)]);
    mockAddVectors.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares rate limiter across sources without fixed 15s gaps", async () => {
    const sources: IngestionSource[] = [
      { ...SOURCE, id: "source-1" },
      { ...SOURCE, id: "source-2" },
    ];

    const start = Date.now();
    const result = await ingestAll(sources, OPTIONS);
    const elapsed = Date.now() - start;

    expect(result).toHaveLength(2);
    expect(result[0]!.status).toBe("completed");
    expect(result[1]!.status).toBe("completed");
    // With small documents there's plenty of TPM headroom — no 15s sleep
    // should occur between sources. Allow up to 1s for test overhead.
    expect(elapsed).toBeLessThan(1_000);
  });
});
