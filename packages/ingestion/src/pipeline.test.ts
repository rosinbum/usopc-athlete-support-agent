import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Document } from "@langchain/core/documents";

// ---------------------------------------------------------------------------
// Mocks — must be before importing the module under test
// ---------------------------------------------------------------------------

const mockPoolQuery = vi.fn().mockResolvedValue({ rowCount: 0 });

vi.mock("@usopc/shared", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
  getPool: () => ({
    query: mockPoolQuery,
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

vi.mock("./transformers/splitter.js", () => ({
  createSplitter: vi.fn(() => ({})),
  splitDocuments: vi.fn(async (docs: Document[]): Promise<Document[]> => docs),
}));

vi.mock("./transformers/metadataEnricher.js", () => ({
  enrichMetadata: vi.fn((docs: Document[]) => docs),
}));

vi.mock("./transformers/sectionExtractor.js", () => ({
  extractSections: vi.fn((docs: Document[]) => docs),
}));

// Now import the module under test
import {
  QuotaExhaustedError,
  backfillDenormalizedColumns,
  ingestSource,
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

  it("runs backfill after embedding using shared pool", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 5 });

    await ingestSource(SOURCE, OPTIONS);

    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE document_chunks"),
    );
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

describe("backfillDenormalizedColumns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs UPDATE using the shared pool", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 3 });

    const updated = await backfillDenormalizedColumns();

    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE document_chunks"),
    );
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("source_url IS NULL"),
    );
    expect(updated).toBe(3);
  });

  it("returns 0 when no rows need backfilling", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });

    const updated = await backfillDenormalizedColumns();

    expect(updated).toBe(0);
  });

  it("propagates query errors", async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error("db error"));

    await expect(backfillDenormalizedColumns()).rejects.toThrow("db error");
  });
});
