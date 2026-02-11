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
const mockIngestionCreate = vi.fn();
const mockIngestionGetForSource = vi.fn();
const mockIngestionUpdateStatus = vi.fn();
const mockIngestionGetLastContentHash = vi.fn();
vi.mock("./entities/index.js", () => ({
  createSourceConfigEntity: vi.fn(() => ({
    getById: (...args: unknown[]) => mockGetById(...args),
    getAllEnabled: (...args: unknown[]) => mockGetAllEnabled(...args),
    markFailure: (...args: unknown[]) => mockMarkFailure(...args),
    markSuccess: (...args: unknown[]) => mockMarkSuccess(...args),
  })),
  createIngestionLogEntity: vi.fn(() => ({
    create: (...args: unknown[]) => mockIngestionCreate(...args),
    getForSource: (...args: unknown[]) => mockIngestionGetForSource(...args),
    updateStatus: (...args: unknown[]) => mockIngestionUpdateStatus(...args),
    getLastContentHash: (...args: unknown[]) =>
      mockIngestionGetLastContentHash(...args),
    getRecent: vi.fn(),
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

  it("enqueues new source when no prior ingestion exists", async () => {
    // No prior ingestion — getLastContentHash returns null
    mockGetLastContentHash.mockResolvedValueOnce(null);

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

  it("skips source when it has already been ingested (any hash)", async () => {
    // Prior ingestion exists — getLastContentHash returns a hash
    mockGetLastContentHash.mockResolvedValueOnce("old-hash");

    await handler();

    expect(mockUpsertIngestionStatus).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("handles mix of new and already-ingested sources", async () => {
    const config = {
      ngbId: "ngb-1",
      sources: [
        {
          id: "src-new",
          title: "New",
          documentType: "policy",
          topicDomains: ["t"],
          url: "https://example.com/new.pdf",
          format: "pdf",
          priority: "medium",
          description: "d",
        },
        {
          id: "src-existing",
          title: "Existing",
          documentType: "policy",
          topicDomains: ["t"],
          url: "https://example.com/existing.pdf",
          format: "pdf",
          priority: "medium",
          description: "d",
        },
      ],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(config));

    // "new" has no prior ingestion, "existing" has a hash
    mockGetLastContentHash
      .mockResolvedValueOnce(null) // src-new -> no prior ingestion
      .mockResolvedValueOnce("existing-hash"); // src-existing -> already ingested

    await handler();

    // Only the new source should be enqueued
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockUpsertIngestionStatus).toHaveBeenCalledTimes(1);
    expect(mockUpsertIngestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "src-new",
      "https://example.com/new.pdf",
      "ingesting",
    );
  });

  it("marks failure and continues when fetch throws", async () => {
    // No prior ingestion so it will attempt fetch
    mockGetLastContentHash.mockResolvedValueOnce(null);
    mockFetchWithRetry.mockRejectedValueOnce(new Error("network error"));

    await handler();

    // When fetch fails, source should be marked as failed (not enqueued)
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

    // Both are new sources (no prior ingestion)
    mockGetLastContentHash
      .mockResolvedValueOnce(null) // src-fail
      .mockResolvedValueOnce(null); // src-ok

    mockUpsertIngestionStatus
      .mockRejectedValueOnce(new Error("db error")) // src-fail ingesting call fails
      .mockResolvedValueOnce(undefined) // src-fail "failed" status (from catch)
      .mockResolvedValueOnce(undefined); // src-ok ingesting call

    await handler();

    // Second source should still have been enqueued
    expect(mockSend).toHaveBeenCalled();
  });

  it("logs alert when all sources fail", async () => {
    // No prior ingestion so it will attempt fetch
    mockGetLastContentHash.mockResolvedValueOnce(null);
    // Make fetch fail for every source
    mockFetchWithRetry.mockRejectedValue(new Error("network error"));

    await handler();

    expect(mockLoggerInstance.error).toHaveBeenCalledWith(
      expect.stringContaining("ALERT: All"),
    );
  });

  it("does not log alert during normal operation", async () => {
    // New source, successful fetch and enqueue
    mockGetLastContentHash.mockResolvedValueOnce(null);

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
      // Second getById for src-ok returns healthy new config (no lastIngestedAt)
      .mockResolvedValueOnce({
        consecutiveFailures: 0,
        lastIngestedAt: null,
      });

    await handler();

    // src-broken should be skipped, src-ok should be enqueued
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
      expect.stringContaining("Skipping src-broken"),
    );
  });
});
