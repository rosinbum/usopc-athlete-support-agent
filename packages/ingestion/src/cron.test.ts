import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
vi.mock("node:fs/promises", () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const mockGetLastContentHash = vi.fn();
const mockUpsertIngestionStatus = vi.fn();
vi.mock("./db.js", () => ({
  getLastContentHash: (...args: unknown[]) => mockGetLastContentHash(...args),
  upsertIngestionStatus: (...args: unknown[]) =>
    mockUpsertIngestionStatus(...args),
}));

const mockSend = vi.fn();
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn(() => ({ send: mockSend })),
  SendMessageCommand: vi.fn((input: unknown) => ({ input })),
}));

vi.mock("sst", () => ({
  Resource: {
    IngestionQueue: {
      url: "https://sqs.us-east-1.amazonaws.com/123/queue.fifo",
    },
  },
}));

const mockPoolEnd = vi.fn();
vi.mock("pg", () => ({
  Pool: vi.fn(() => ({
    query: vi.fn(),
    end: mockPoolEnd,
  })),
}));

const { mockLoggerInstance } = vi.hoisted(() => ({
  mockLoggerInstance: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  },
}));
vi.mock("@usopc/shared", () => ({
  getDatabaseUrl: () => "postgresql://localhost/test",
  isProduction: () => false, // Always use JSON files in tests
  createLogger: () => mockLoggerInstance,
}));

// Mock fetchWithRetry to use the global fetch mock
const mockFetchWithRetry = vi.fn();
vi.mock("./loaders/fetchWithRetry.js", () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
}));

// Mock the entities module
const mockGetById = vi.fn();
const mockGetAllEnabled = vi.fn();
const mockMarkFailure = vi.fn();
const mockMarkSuccess = vi.fn();
vi.mock("./entities/index.js", () => ({
  createSourceConfigEntity: vi.fn(() => ({
    getById: (...args: unknown[]) => mockGetById(...args),
    getAllEnabled: (...args: unknown[]) => mockGetAllEnabled(...args),
    markFailure: (...args: unknown[]) => mockMarkFailure(...args),
    markSuccess: (...args: unknown[]) => mockMarkSuccess(...args),
  })),
}));

// Import after mocks
import { handler } from "./cron.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSourceConfig(overrides: Record<string, unknown> = {}) {
  return {
    ngbId: "ngb-1",
    sources: [
      {
        id: "src-1",
        title: "Test Source",
        documentType: "policy",
        topicDomains: ["testing"],
        url: "https://example.com/doc.pdf",
        format: "pdf",
        priority: "medium",
        description: "A test source",
        ...overrides,
      },
    ],
  };
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cron handler", () => {
  const originalEnv = process.env.SOURCES_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SOURCES_DIR = "/fake/sources";
    delete process.env.USE_DYNAMODB; // Ensure we use JSON files

    mockPoolEnd.mockResolvedValue(undefined);
    mockUpsertIngestionStatus.mockResolvedValue(undefined);
    mockSend.mockResolvedValue({});

    // Default: readdir returns one JSON file
    mockReaddir.mockResolvedValue(["source1.json"]);
    mockReadFile.mockResolvedValue(JSON.stringify(makeSourceConfig()));

    // Mock fetchWithRetry to return a response-like object
    mockFetchWithRetry.mockResolvedValue({
      text: () => Promise.resolve("fetched content"),
    });
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SOURCES_DIR;
    } else {
      process.env.SOURCES_DIR = originalEnv;
    }
  });

  it("enqueues changed source when hash differs from DB", async () => {
    mockGetLastContentHash.mockResolvedValueOnce("old-hash");

    await handler();

    expect(mockUpsertIngestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "src-1",
      "https://example.com/doc.pdf",
      "ingesting",
    );
    expect(mockSend).toHaveBeenCalledOnce();

    // Verify the SendMessageCommand was created with correct params
    const { SendMessageCommand } = await import("@aws-sdk/client-sqs");
    expect(SendMessageCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        QueueUrl: "https://sqs.us-east-1.amazonaws.com/123/queue.fifo",
        MessageGroupId: "ingestion",
      }),
    );
  });

  it("skips unchanged source when hash matches DB", async () => {
    const expectedHash = hashContent("fetched content");
    mockGetLastContentHash.mockResolvedValueOnce(expectedHash);

    await handler();

    expect(mockUpsertIngestionStatus).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("handles mix of changed and unchanged sources", async () => {
    const config = {
      ngbId: "ngb-1",
      sources: [
        {
          id: "src-changed",
          title: "Changed",
          documentType: "policy",
          topicDomains: ["t"],
          url: "https://example.com/changed.pdf",
          format: "pdf",
          priority: "medium",
          description: "d",
        },
        {
          id: "src-same",
          title: "Same",
          documentType: "policy",
          topicDomains: ["t"],
          url: "https://example.com/same.pdf",
          format: "pdf",
          priority: "medium",
          description: "d",
        },
      ],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(config));

    // "changed" has different hash, "same" has matching hash
    const expectedHash = hashContent("fetched content");
    mockGetLastContentHash
      .mockResolvedValueOnce("old-hash") // src-changed → different
      .mockResolvedValueOnce(expectedHash); // src-same → same

    await handler();

    // Only one source should be enqueued
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockUpsertIngestionStatus).toHaveBeenCalledTimes(1);
    expect(mockUpsertIngestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "src-changed",
      "https://example.com/changed.pdf",
      "ingesting",
    );
  });

  it("marks failure and continues when fetch throws", async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error("network error"));
    mockGetLastContentHash.mockResolvedValueOnce("any-old-hash");

    await handler();

    // When fetch fails, source should be marked as failed (not enqueued)
    // The handler now continues to the next source instead of forcing re-ingestion
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("handles per-source errors without stopping other sources", async () => {
    const config = {
      ngbId: "ngb-1",
      sources: [
        {
          id: "src-fail",
          title: "Fail",
          documentType: "policy",
          topicDomains: ["t"],
          url: "https://example.com/fail.pdf",
          format: "pdf",
          priority: "medium",
          description: "d",
        },
        {
          id: "src-ok",
          title: "OK",
          documentType: "policy",
          topicDomains: ["t"],
          url: "https://example.com/ok.pdf",
          format: "pdf",
          priority: "medium",
          description: "d",
        },
      ],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(config));

    // First source: getLastContentHash succeeds but upsertIngestionStatus throws
    mockGetLastContentHash
      .mockResolvedValueOnce("old-hash-1")
      .mockResolvedValueOnce("old-hash-2");

    mockUpsertIngestionStatus
      .mockRejectedValueOnce(new Error("db error")) // src-fail ingesting call fails
      .mockResolvedValueOnce(undefined) // src-ok ingesting call
      .mockResolvedValueOnce(undefined); // src-fail "failed" status (from catch)

    await handler();

    // Second source should still have been enqueued
    expect(mockSend).toHaveBeenCalled();
  });

  it("always calls pool.end()", async () => {
    mockGetLastContentHash.mockResolvedValueOnce("old-hash");

    await handler();

    expect(mockPoolEnd).toHaveBeenCalledOnce();
  });

  it("calls pool.end() even when loadSourceConfigs throws", async () => {
    mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));

    await expect(handler()).rejects.toThrow("ENOENT");

    expect(mockPoolEnd).toHaveBeenCalledOnce();
  });

  it("logs alert when all sources fail", async () => {
    // Make fetch fail for every source
    mockFetchWithRetry.mockRejectedValue(new Error("network error"));

    await handler();

    expect(mockLoggerInstance.error).toHaveBeenCalledWith(
      expect.stringContaining("ALERT: All"),
    );
  });

  it("does not log alert during normal operation", async () => {
    mockGetLastContentHash.mockResolvedValueOnce("old-hash");

    await handler();

    // Check that no ALERT: message was logged
    for (const call of mockLoggerInstance.error.mock.calls) {
      expect(call[0]).not.toMatch(/ALERT:/);
    }
    for (const call of mockLoggerInstance.warn.mock.calls) {
      expect(call[0]).not.toMatch(/ALERT:/);
    }
  });
});

describe("cron handler (DynamoDB mode)", () => {
  const originalEnv = process.env.SOURCES_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SOURCES_DIR = "/fake/sources";
    process.env.USE_DYNAMODB = "true";

    mockPoolEnd.mockResolvedValue(undefined);
    mockUpsertIngestionStatus.mockResolvedValue(undefined);
    mockSend.mockResolvedValue({});
    mockMarkFailure.mockResolvedValue(undefined);
    mockMarkSuccess.mockResolvedValue(undefined);

    // Mock fetchWithRetry to return a response-like object
    mockFetchWithRetry.mockResolvedValue({
      text: () => Promise.resolve("fetched content"),
    });
  });

  afterEach(() => {
    delete process.env.USE_DYNAMODB;
    if (originalEnv === undefined) {
      delete process.env.SOURCES_DIR;
    } else {
      process.env.SOURCES_DIR = originalEnv;
    }
  });

  it("skips sources with 3+ consecutive failures", async () => {
    mockGetAllEnabled.mockResolvedValueOnce([
      {
        id: "src-broken",
        title: "Broken",
        documentType: "policy",
        topicDomains: ["t"],
        url: "https://example.com/broken.pdf",
        format: "pdf",
        ngbId: null,
        priority: "medium",
        description: "d",
        authorityLevel: "official",
        enabled: true,
        lastIngestedAt: null,
        lastContentHash: null,
        consecutiveFailures: 3,
        lastError: "fetch error",
        s3Key: null,
        s3VersionId: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "src-ok",
        title: "OK",
        documentType: "policy",
        topicDomains: ["t"],
        url: "https://example.com/ok.pdf",
        format: "pdf",
        ngbId: null,
        priority: "medium",
        description: "d",
        authorityLevel: "official",
        enabled: true,
        lastIngestedAt: null,
        lastContentHash: null,
        consecutiveFailures: 0,
        lastError: null,
        s3Key: null,
        s3VersionId: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ]);

    // First getById for src-broken (failure check) returns the failing config
    mockGetById
      .mockResolvedValueOnce({
        consecutiveFailures: 3,
        lastContentHash: null,
      })
      // Second getById for src-ok (failure check) returns healthy config
      .mockResolvedValueOnce({
        consecutiveFailures: 0,
        lastContentHash: "old-hash",
      });

    await handler();

    // src-broken should be skipped, src-ok should be enqueued
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
      expect.stringContaining("Skipping src-broken"),
    );
  });
});
