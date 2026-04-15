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

const { mockSendMessage, mockLoggerInstance } = vi.hoisted(() => ({
  mockSendMessage: vi.fn().mockResolvedValue(undefined),
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
  getResource: (key: string) => {
    const resources: Record<string, unknown> = {
      IngestionQueue: { url: "https://queue.example.com/ingestion" },
    };
    return resources[key];
  },
  createQueueService: () => ({
    sendMessage: mockSendMessage,
    sendMessageBatch: vi.fn().mockResolvedValue(0),
    purge: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue(null),
  }),
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
    delete process.env.USE_DB; // Ensure we use JSON files

    mockUpsertIngestionStatus.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue({});

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

    expect(mockSendMessage).toHaveBeenCalledOnce();
    expect(mockSendMessage).toHaveBeenCalledWith(
      "https://queue.example.com/ingestion",
      expect.any(String),
      { groupId: "ingestion" },
    );
  });

  it("includes source and triggeredAt in queue message", async () => {
    mockGetLastContentHash.mockResolvedValueOnce(null);

    await handler();

    const messageBody = mockSendMessage.mock.calls[0]![1] as string;
    const body = JSON.parse(messageBody);
    expect(body.source.id).toBe("src-1");
    expect(body.triggeredAt).toBeDefined();
  });

  it("skips source when it has already been ingested (any hash)", async () => {
    mockGetLastContentHash.mockResolvedValueOnce("old-hash");

    await handler();

    expect(mockSendMessage).not.toHaveBeenCalled();
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

    expect(mockSendMessage).toHaveBeenCalledOnce();
  });
});

describe("cron handler (database mode)", () => {
  const originalEnv = process.env.SOURCES_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SOURCES_DIR = "/fake/sources";
    process.env.USE_DB = "true";

    mockUpsertIngestionStatus.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue({});
    mockMarkFailure.mockResolvedValue(undefined);
    mockMarkSuccess.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.USE_DB;
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
        storageKey: null,
        storageVersionId: null,
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
        storageKey: null,
        storageVersionId: null,
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
    expect(mockSendMessage).toHaveBeenCalledOnce();
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
        storageKey: null,
        storageVersionId: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ]);

    mockGetById.mockResolvedValueOnce({
      consecutiveFailures: 0,
      lastIngestedAt: "2025-01-01T00:00:00Z",
    });

    await handler();

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
