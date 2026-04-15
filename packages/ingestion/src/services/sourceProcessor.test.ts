import { describe, it, expect, vi, beforeEach } from "vitest";

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

const mockIngestSource = vi.fn();
vi.mock("../pipeline.js", async () => {
  const QuotaExhaustedError = class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "QuotaExhaustedError";
    }
  };
  return {
    ingestSource: (...args: unknown[]) => mockIngestSource(...args),
    QuotaExhaustedError,
  };
});

const mockUpsertIngestionStatus = vi.fn();
vi.mock("../db.js", () => ({
  upsertIngestionStatus: (...args: unknown[]) =>
    mockUpsertIngestionStatus(...args),
}));

const mockFetchWithRetry = vi.fn();
vi.mock("../loaders/fetchWithRetry.js", () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
}));

const mockStoreDocument = vi.fn();
const mockDocumentExists = vi.fn();
const mockGetKeyForSource = vi.fn();
vi.mock("./documentStorage.js", () => ({
  DocumentStorageService: vi.fn(() => ({
    storeDocument: (...args: unknown[]) => mockStoreDocument(...args),
    documentExists: (...args: unknown[]) => mockDocumentExists(...args),
    getKeyForSource: (...args: unknown[]) => mockGetKeyForSource(...args),
  })),
}));

// Import after mocks
import { processSource } from "./sourceProcessor.js";
import { QuotaExhaustedError } from "../pipeline.js";
import type { ProcessSourceOptions } from "./sourceProcessor.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SOURCE = {
  id: "src-1",
  title: "Test Source",
  documentType: "policy",
  topicDomains: ["testing"],
  url: "https://example.com/doc.pdf",
  format: "pdf" as const,
  ngbId: null,
  priority: "medium" as const,
  description: "A test source",
};

const mockIngestionLogEntity = {
  create: vi.fn(),
  getForSource: vi.fn(),
  updateStatus: vi.fn(),
  getLastContentHash: vi.fn(),
  getRecent: vi.fn(),
};

const mockSourceConfigEntity = {
  markSuccess: vi.fn(),
  markFailure: vi.fn(),
};

function makeOpts(
  overrides?: Partial<ProcessSourceOptions>,
): ProcessSourceOptions {
  return {
    source: SOURCE,
    openaiApiKey: "sk-test-key",
    bucketName: "test-bucket",
    ingestionLogEntity: mockIngestionLogEntity as never,
    sourceConfigEntity: mockSourceConfigEntity as never,
    ...overrides,
  };
}

function mockFetchResponse(content: string | ArrayBuffer): void {
  const arrayBuffer =
    typeof content === "string"
      ? new TextEncoder().encode(content).buffer
      : content;
  mockFetchWithRetry.mockResolvedValueOnce({
    arrayBuffer: () => Promise.resolve(arrayBuffer),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertIngestionStatus.mockResolvedValue(undefined);
    mockSourceConfigEntity.markSuccess.mockResolvedValue(undefined);
    mockSourceConfigEntity.markFailure.mockResolvedValue(undefined);
    mockGetKeyForSource.mockReturnValue("sources/src-1/abc123.pdf");
    mockDocumentExists.mockResolvedValue(false);
    mockStoreDocument.mockResolvedValue({
      key: "sources/src-1/abc123.pdf",
      versionId: "v1",
    });
  });

  it("returns completed with chunks on successful ingestion", async () => {
    mockFetchResponse("PDF content here");
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "completed",
      chunksCount: 10,
    });

    const result = await processSource(makeOpts());

    expect(result.status).toBe("completed");
    expect(result.chunksCount).toBe(10);
    expect(result.contentHash).toBeDefined();
    expect(result.storageKey).toBe("sources/src-1/abc123.pdf");

    // Passes content buffer to ingestSource to avoid double-fetch
    expect(mockIngestSource).toHaveBeenCalledWith(
      SOURCE,
      expect.objectContaining({
        content: expect.any(Buffer),
        openaiApiKey: "sk-test-key",
      }),
    );
  });

  it("marks ingesting status before calling ingestSource", async () => {
    mockFetchResponse("content");
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "completed",
      chunksCount: 5,
    });

    await processSource(makeOpts());

    // Should call upsert with "ingesting" before the ingest call
    const calls = mockUpsertIngestionStatus.mock.calls;
    expect(calls[0]![3]).toBe("ingesting");
    expect(calls[1]![3]).toBe("completed");
  });

  it("updates source config on successful ingestion", async () => {
    mockFetchResponse("content");
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "completed",
      chunksCount: 10,
    });

    await processSource(makeOpts());

    expect(mockSourceConfigEntity.markSuccess).toHaveBeenCalledWith(
      "src-1",
      expect.any(String),
      expect.objectContaining({ storageKey: "sources/src-1/abc123.pdf" }),
    );
  });

  it("returns failed when fetch fails", async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error("Network error"));

    const result = await processSource(makeOpts());

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Network error");
    expect(mockIngestSource).not.toHaveBeenCalled();
    expect(mockSourceConfigEntity.markFailure).toHaveBeenCalledWith(
      "src-1",
      "Network error",
    );
  });

  it("continues ingestion when storage upload fails (non-fatal)", async () => {
    mockFetchResponse("content");
    mockDocumentExists.mockRejectedValueOnce(new Error("S3 down"));
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "completed",
      chunksCount: 5,
    });

    const result = await processSource(makeOpts());

    expect(result.status).toBe("completed");
    expect(result.storageKey).toBeUndefined();
    expect(mockIngestSource).toHaveBeenCalled();
  });

  it("skips storage upload when document already exists", async () => {
    mockFetchResponse("content");
    mockDocumentExists.mockResolvedValueOnce(true);
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "completed",
      chunksCount: 5,
    });

    const result = await processSource(makeOpts());

    expect(result.status).toBe("completed");
    expect(result.storageKey).toBe("sources/src-1/abc123.pdf");
    expect(mockStoreDocument).not.toHaveBeenCalled();
  });

  it("re-throws QuotaExhaustedError", async () => {
    mockFetchResponse("content");
    mockIngestSource.mockRejectedValueOnce(
      new QuotaExhaustedError("insufficient_quota"),
    );

    await expect(processSource(makeOpts())).rejects.toThrow(
      QuotaExhaustedError,
    );
  });

  it("updates source config on failed ingestion", async () => {
    mockFetchResponse("content");
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "failed",
      chunksCount: 0,
      error: "Parse error",
    });

    const result = await processSource(makeOpts());

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Parse error");
    expect(mockUpsertIngestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "src-1",
      "https://example.com/doc.pdf",
      "failed",
      { errorMessage: "Parse error" },
    );
    expect(mockSourceConfigEntity.markFailure).toHaveBeenCalledWith(
      "src-1",
      "Parse error",
    );
  });

  it("works without sourceConfigEntity", async () => {
    mockFetchResponse("content");
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "completed",
      chunksCount: 5,
    });

    const result = await processSource(
      makeOpts({ sourceConfigEntity: undefined }),
    );

    expect(result.status).toBe("completed");
    expect(mockSourceConfigEntity.markSuccess).not.toHaveBeenCalled();
  });

  it("fetches content as binary (arrayBuffer) for correct PDF handling", async () => {
    // Simulate binary PDF content
    const binaryContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    mockFetchWithRetry.mockResolvedValueOnce({
      arrayBuffer: () => Promise.resolve(binaryContent),
    });
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "completed",
      chunksCount: 1,
    });

    await processSource(makeOpts());

    // Verify the content buffer passed to ingestSource contains the raw bytes
    const passedContent = mockIngestSource.mock.calls[0]![1].content;
    expect(passedContent).toBeInstanceOf(Buffer);
    expect(passedContent[0]).toBe(0x25); // %PDF magic byte
  });
});
