import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockProcessSource = vi.fn();
vi.mock("./services/sourceProcessor.js", () => ({
  processSource: (...args: unknown[]) => mockProcessSource(...args),
}));

vi.mock("./pipeline.js", async () => {
  const QuotaExhaustedError = class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "QuotaExhaustedError";
    }
  };
  return {
    QuotaExhaustedError,
  };
});

const mockUpsertIngestionStatus = vi.fn();
vi.mock("./db.js", () => ({
  upsertIngestionStatus: (...args: unknown[]) =>
    mockUpsertIngestionStatus(...args),
}));

const mockPurge = vi.fn().mockResolvedValue(undefined);

// Mock the entities module (IngestionLogEntity + SourceConfigEntity factories)
const mockCreate = vi.fn();
const mockGetForSource = vi.fn();
const mockUpdateStatus = vi.fn();
const mockGetLastContentHash = vi.fn();
vi.mock("./entities/index.js", () => ({
  createIngestionLogEntity: vi.fn(() => ({
    create: (...args: unknown[]) => mockCreate(...args),
    getForSource: (...args: unknown[]) => mockGetForSource(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    getLastContentHash: (...args: unknown[]) => mockGetLastContentHash(...args),
    getRecent: vi.fn(),
  })),
  createSourceConfigEntity: vi.fn(() => ({
    markSuccess: vi.fn(),
    markFailure: vi.fn(),
  })),
}));

vi.mock("@usopc/shared", () => ({
  getSecretValue: () => "sk-test-key",
  getResource: (key: string) => {
    const resources: Record<string, unknown> = {
      IngestionQueue: { url: "https://queue.example.com/ingestion" },
      DocumentsBucket: { name: "test-documents-bucket" },
    };
    return resources[key];
  },
  createQueueService: () => ({
    sendMessage: vi.fn(),
    sendMessageBatch: vi.fn(),
    purge: mockPurge,
    getStats: vi.fn(),
  }),
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

// Import after mocks
import { handleIngestionMessage } from "./worker.js";
import { QuotaExhaustedError } from "./pipeline.js";
import type { IngestionMessage } from "./cron.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MESSAGE: IngestionMessage = {
  source: {
    id: "src-1",
    title: "Test",
    documentType: "policy",
    topicDomains: ["testing"],
    url: "https://example.com/doc.pdf",
    format: "pdf",
    ngbId: null,
    priority: "medium",
    description: "desc",
  },
  triggeredAt: "2025-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleIngestionMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertIngestionStatus.mockResolvedValue(undefined);
    mockPurge.mockResolvedValue({});
  });

  it("calls processSource on success", async () => {
    mockProcessSource.mockResolvedValueOnce({
      status: "completed",
      chunksCount: 10,
      contentHash: "abc123",
      storageKey: "sources/src-1/abc123.pdf",
    });

    await handleIngestionMessage(MESSAGE);

    expect(mockProcessSource).toHaveBeenCalledWith(
      expect.objectContaining({
        source: MESSAGE.source,
        openaiApiKey: "sk-test-key",
        bucketName: "test-documents-bucket",
      }),
    );
  });

  it("does not throw on graceful ingestion failure", async () => {
    mockProcessSource.mockResolvedValueOnce({
      status: "failed",
      chunksCount: 0,
      error: "load error",
    });

    await expect(handleIngestionMessage(MESSAGE)).resolves.toBeUndefined();
  });

  it("purges queue and throws on QuotaExhaustedError", async () => {
    mockProcessSource.mockRejectedValueOnce(
      new QuotaExhaustedError("insufficient_quota"),
    );

    await expect(handleIngestionMessage(MESSAGE)).rejects.toThrow(
      "insufficient_quota",
    );

    expect(mockUpsertIngestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "src-1",
      "https://example.com/doc.pdf",
      "quota_exceeded",
      { errorMessage: "insufficient_quota" },
    );
    expect(mockPurge).toHaveBeenCalledOnce();
  });

  it("throws on unexpected error", async () => {
    mockProcessSource.mockRejectedValueOnce(new Error("kaboom"));

    await expect(handleIngestionMessage(MESSAGE)).rejects.toThrow("kaboom");
  });
});
