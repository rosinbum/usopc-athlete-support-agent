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

vi.mock("@usopc/shared", () => ({
  getDatabaseUrl: () => "postgresql://localhost/test",
  isProduction: () => false, // Always use JSON files in tests
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

// Mock fetchWithRetry to use the global fetch mock
const mockFetchWithRetry = vi.fn();
vi.mock("./loaders/fetchWithRetry.js", () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
}));

// Mock the entities module (not used when isProduction returns false)
vi.mock("./entities/index.js", () => ({
  createSourceConfigEntity: vi.fn(),
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
});
