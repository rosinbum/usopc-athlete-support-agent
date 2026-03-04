import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SOURCES_DIR;
    } else {
      process.env.SOURCES_DIR = originalEnv;
    }
  });

  it("enqueues new source when no prior ingestion exists", async () => {
    mockGetLastContentHash.mockResolvedValueOnce(null);

    await handler();

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

  it("includes source and triggeredAt in SQS message", async () => {
    mockGetLastContentHash.mockResolvedValueOnce(null);

    await handler();

    const { SendMessageCommand } = await import("@aws-sdk/client-sqs");
    const callArgs = vi.mocked(SendMessageCommand).mock.calls[0]![0]!;
    const body = JSON.parse(callArgs.MessageBody as string);
    expect(body.source.id).toBe("src-1");
    expect(body.triggeredAt).toBeDefined();
  });

  it("skips source when it has already been ingested (any hash)", async () => {
    mockGetLastContentHash.mockResolvedValueOnce("old-hash");

    await handler();

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

    mockGetLastContentHash
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("existing-hash");

    await handler();

    expect(mockSend).toHaveBeenCalledOnce();
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

    mockGetById
      .mockResolvedValueOnce({
        consecutiveFailures: 3,
        lastContentHash: null,
      })
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

  it("skips already-ingested sources", async () => {
    mockGetAllEnabled.mockResolvedValueOnce([
      {
        id: "src-done",
        title: "Done",
        documentType: "policy",
        topicDomains: ["t"],
        url: "https://example.com/done.pdf",
        format: "pdf",
        ngbId: null,
        priority: "medium",
        description: "d",
        authorityLevel: "official",
        enabled: true,
        lastIngestedAt: "2025-01-01T00:00:00Z",
        lastContentHash: "abc123",
        consecutiveFailures: 0,
        lastError: null,
        s3Key: null,
        s3VersionId: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ]);

    mockGetById.mockResolvedValueOnce({
      consecutiveFailures: 0,
      lastIngestedAt: "2025-01-01T00:00:00Z",
    });

    await handler();

    expect(mockSend).not.toHaveBeenCalled();
  });
});
