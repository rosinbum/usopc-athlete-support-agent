import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Document } from "@langchain/core/documents";

// ---------------------------------------------------------------------------
// Mocks — must be before importing the module under test
// ---------------------------------------------------------------------------

const mockPgQuery = vi.fn().mockResolvedValue({ rowCount: 0 });
const mockPgConnect = vi.fn().mockResolvedValue(undefined);
const mockPgEnd = vi.fn().mockResolvedValue(undefined);

vi.mock("pg", () => ({
  Client: vi.fn(() => ({
    connect: mockPgConnect,
    query: mockPgQuery,
    end: mockPgEnd,
  })),
}));

vi.mock("@usopc/shared", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

const mockAddDocuments = vi.fn();

vi.mock("@usopc/core/src/rag/index", () => ({
  createEmbeddings: vi.fn(() => ({})),
  createVectorStore: vi.fn(async () => ({
    addDocuments: mockAddDocuments,
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
import { Client } from "pg";

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
  databaseUrl: "postgresql://localhost/test",
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
    mockAddDocuments.mockResolvedValue(undefined);
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

  it("runs backfill after embedding", async () => {
    mockPgQuery.mockResolvedValueOnce({ rowCount: 5 });

    await ingestSource(SOURCE, OPTIONS);

    expect(Client).toHaveBeenCalledWith({
      connectionString: OPTIONS.databaseUrl,
    });
    expect(mockPgConnect).toHaveBeenCalled();
    expect(mockPgQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE document_chunks"),
    );
    expect(mockPgEnd).toHaveBeenCalled();
  });

  it("throws QuotaExhaustedError for 'insufficient_quota' errors", async () => {
    mockAddDocuments.mockRejectedValueOnce(
      new Error("insufficient_quota: please upgrade your plan"),
    );

    await expect(ingestSource(SOURCE, OPTIONS)).rejects.toThrow(
      QuotaExhaustedError,
    );
  });

  it("throws QuotaExhaustedError for 'exceeded your current quota' errors", async () => {
    mockAddDocuments.mockRejectedValueOnce(
      new Error("You exceeded your current quota"),
    );

    await expect(ingestSource(SOURCE, OPTIONS)).rejects.toThrow(
      QuotaExhaustedError,
    );
  });

  it("throws QuotaExhaustedError for 'billing hard limit has been reached' errors", async () => {
    mockAddDocuments.mockRejectedValueOnce(
      new Error("billing hard limit has been reached"),
    );

    await expect(ingestSource(SOURCE, OPTIONS)).rejects.toThrow(
      QuotaExhaustedError,
    );
  });

  it("returns failed result for non-quota errors", async () => {
    mockAddDocuments.mockRejectedValueOnce(new Error("network timeout"));

    const result = await ingestSource(SOURCE, OPTIONS);

    expect(result).toEqual({
      sourceId: "test-source",
      status: "failed",
      chunksCount: 0,
      error: "network timeout",
    });
  });
});

describe("backfillDenormalizedColumns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connects, runs UPDATE, and closes the client", async () => {
    mockPgQuery.mockResolvedValueOnce({ rowCount: 3 });

    const updated = await backfillDenormalizedColumns(
      "postgresql://localhost/test",
    );

    expect(Client).toHaveBeenCalledWith({
      connectionString: "postgresql://localhost/test",
    });
    expect(mockPgConnect).toHaveBeenCalled();
    expect(mockPgQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE document_chunks"),
    );
    expect(mockPgQuery).toHaveBeenCalledWith(
      expect.stringContaining("source_url IS NULL"),
    );
    expect(mockPgEnd).toHaveBeenCalled();
    expect(updated).toBe(3);
  });

  it("returns 0 when no rows need backfilling", async () => {
    mockPgQuery.mockResolvedValueOnce({ rowCount: 0 });

    const updated = await backfillDenormalizedColumns(
      "postgresql://localhost/test",
    );

    expect(updated).toBe(0);
  });

  it("closes client even on query error", async () => {
    mockPgQuery.mockRejectedValueOnce(new Error("db error"));

    await expect(
      backfillDenormalizedColumns("postgresql://localhost/test"),
    ).rejects.toThrow("db error");

    expect(mockPgEnd).toHaveBeenCalled();
  });
});
