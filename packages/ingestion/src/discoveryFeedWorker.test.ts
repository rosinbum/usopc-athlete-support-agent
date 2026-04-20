import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DiscoveryFeedMessage } from "@usopc/core";

// Will be set in beforeEach
const mockCreateDiscoveredSourceEntity = vi.fn();

// Mock @usopc/shared
vi.mock("@usopc/shared", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  getSecretValue: vi.fn(() => "test-anthropic-key"),
  getResource: vi.fn(() => ({ url: "https://queue.example.com/ingestion" })),
  createDiscoveredSourceEntity: (...args: unknown[]) =>
    mockCreateDiscoveredSourceEntity(...args),
  createSourceConfigEntity: vi.fn(() => ({})),
  REPROCESSABLE_STATUSES: new Set(["pending_metadata", "pending_content"]),
  normalizeUrl: vi.fn((url: string) => url),
  urlToId: vi.fn(() => "test-id-hash"),
  sendDiscoveryToSources: vi
    .fn()
    .mockResolvedValue({ status: "created", sourceConfig: null }),
  createQueueService: () => ({
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendMessageBatch: vi.fn().mockResolvedValue(0),
    purge: vi.fn(),
    getStats: vi.fn(),
  }),
}));

// Mock EvaluationService
vi.mock("./services/evaluationService.js", () => ({
  EvaluationService: vi.fn(),
}));

// Mock loadWeb
vi.mock("./loaders/webLoader.js", () => ({
  loadWeb: vi.fn(),
}));

// Mock cron (toIngestionSource)
vi.mock("./cron.js", () => ({
  toIngestionSource: vi.fn((sc: unknown) => sc),
}));

// Mock entities
vi.mock("./entities/index.js", () => ({
  createSourceConfigEntity: vi.fn(() => ({
    create: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
  })),
}));

import { normalizeUrl } from "@usopc/shared";
import { EvaluationService } from "./services/evaluationService.js";
import { loadWeb } from "./loaders/webLoader.js";
import { handleDiscoveryFeedMessage } from "./discoveryFeedWorker.js";

const MockEvaluationService = vi.mocked(EvaluationService);
const mockLoadWeb = vi.mocked(loadWeb);
const mockNormalizeUrl = vi.mocked(normalizeUrl);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Shape of a PG unique-constraint error: `pg` attaches `.code` with
// SQLSTATE 23505 when an INSERT collides on a primary/unique key.
function pgUniqueViolation(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "discovered_sources_pkey"',
    ),
    { code: "23505" },
  );
}

function makeMessage(
  urls: Array<{ url: string; title?: string }>,
  opts?: { autoApprovalThreshold?: number },
): DiscoveryFeedMessage {
  return {
    urls: urls.map((u) => ({
      url: u.url,
      title: u.title ?? "Test Title",
      discoveryMethod: "agent" as const,
      discoveredFrom: "agent-web-search",
    })),
    autoApprovalThreshold: opts?.autoApprovalThreshold,
    timestamp: new Date().toISOString(),
  };
}

function makeMockEntity() {
  return {
    create: vi.fn().mockResolvedValue({}),
    getById: vi.fn().mockResolvedValue(null),
    markMetadataEvaluated: vi.fn().mockResolvedValue({}),
    markContentEvaluated: vi.fn().mockResolvedValue({}),
    getAll: vi.fn(),
    getByStatus: vi.fn(),
    getApprovedSince: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    linkToSourceConfig: vi.fn(),
    recordError: vi.fn().mockResolvedValue({ errorCount: 1 }),
    clearError: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockEvalService() {
  return {
    evaluateMetadata: vi.fn().mockResolvedValue({
      isRelevant: true,
      confidence: 0.8,
      reasoning: "Relevant to USOPC",
      suggestedTopicDomains: ["governance"],
      preliminaryDocumentType: "policy",
    }),
    evaluateContent: vi.fn().mockResolvedValue({
      isHighQuality: true,
      confidence: 0.9,
      documentType: "policy",
      topicDomains: ["governance"],
      authorityLevel: "usopc_governance",
      priority: "high",
      description: "USOPC governance document",
      keyTopics: ["governance"],
      ngbId: null,
    }),
    calculateCombinedConfidence: vi.fn().mockReturnValue(0.87),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("discoveryFeedWorker", () => {
  let mockEntity: ReturnType<typeof makeMockEntity>;
  let mockEvalService: ReturnType<typeof makeMockEvalService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEntity = makeMockEntity();
    mockCreateDiscoveredSourceEntity.mockReturnValue(mockEntity);

    mockEvalService = makeMockEvalService();
    MockEvaluationService.mockImplementation(() => mockEvalService as any);

    mockLoadWeb.mockResolvedValue([
      { pageContent: "Test content", metadata: {} } as any,
    ]);

    mockNormalizeUrl.mockImplementation((url) => url);
  });

  it("processes message URLs correctly", async () => {
    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }]),
    );

    expect(mockEntity.create).toHaveBeenCalledTimes(1);
  });

  it("creates DiscoveredSource entries with correct fields", async () => {
    await handleDiscoveryFeedMessage(
      makeMessage([
        { url: "https://usopc.org/doc1", title: "USOPC Selection" },
      ]),
    );

    expect(mockEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://usopc.org/doc1",
        title: "USOPC Selection",
        discoveryMethod: "agent",
        discoveredFrom: "agent-web-search",
      }),
    );
  });

  it("calls evaluateMetadata with URL, title, and extracted domain", async () => {
    await handleDiscoveryFeedMessage(
      makeMessage([
        { url: "https://usopc.org/doc1", title: "USOPC Selection" },
      ]),
    );

    expect(mockEvalService.evaluateMetadata).toHaveBeenCalledWith(
      "https://usopc.org/doc1",
      "USOPC Selection",
      "usopc.org",
    );
  });

  it("calls markMetadataEvaluated with LLM results", async () => {
    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }]),
    );

    expect(mockEntity.markMetadataEvaluated).toHaveBeenCalledWith(
      "test-id-hash",
      0.8,
      "Relevant to USOPC",
      ["governance"],
      "policy",
    );
  });

  it("stops at metadata eval when rejected (does not call loadWeb)", async () => {
    mockEvalService.evaluateMetadata.mockResolvedValueOnce({
      isRelevant: false,
      confidence: 0.3,
      reasoning: "Not relevant",
      suggestedTopicDomains: [],
      preliminaryDocumentType: "",
    });

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }]),
    );

    expect(mockEntity.markMetadataEvaluated).toHaveBeenCalled();
    expect(mockLoadWeb).not.toHaveBeenCalled();
    expect(mockEvalService.evaluateContent).not.toHaveBeenCalled();
    expect(mockEntity.markContentEvaluated).not.toHaveBeenCalled();
  });

  it("stops at metadata eval when confidence < 0.5", async () => {
    mockEvalService.evaluateMetadata.mockResolvedValueOnce({
      isRelevant: true,
      confidence: 0.4,
      reasoning: "Low confidence",
      suggestedTopicDomains: [],
      preliminaryDocumentType: "",
    });

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }]),
    );

    expect(mockLoadWeb).not.toHaveBeenCalled();
  });

  it("calls loadWeb, evaluateContent, markContentEvaluated for passing metadata", async () => {
    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }]),
    );

    expect(mockLoadWeb).toHaveBeenCalledWith("https://usopc.org/doc1");
    expect(mockEvalService.evaluateContent).toHaveBeenCalledWith(
      "https://usopc.org/doc1",
      "Test Title",
      "Test content",
    );
    expect(mockEntity.markContentEvaluated).toHaveBeenCalledWith(
      "test-id-hash",
      0.9,
      0.87,
      expect.objectContaining({
        documentType: "policy",
        topicDomains: ["governance"],
        authorityLevel: "usopc_governance",
        priority: "high",
      }),
      "USOPC governance document",
      0.7,
    );
  });

  it("skips existing URLs (duplicate-key on PG insert)", async () => {
    mockEntity.create.mockRejectedValueOnce(pgUniqueViolation());

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/existing" }]),
    );

    expect(mockEvalService.evaluateMetadata).not.toHaveBeenCalled();
    expect(mockLoadWeb).not.toHaveBeenCalled();
  });

  // Regression for #701: pre-fix code matched on `msg.includes("Conditional")`
  // (DynamoDB-era), which never matched PG's "duplicate key" message — so
  // re-queued stuck rows always rethrew, hit recordError, and after 3 attempts
  // were rejected. Now the duplicate-key path is taken on `code === "23505"`,
  // so `recordError` should NOT be called for that case.
  it("does not record an error when PG duplicate-key triggers the re-evaluate path", async () => {
    mockEntity.create.mockRejectedValueOnce(pgUniqueViolation());
    mockEntity.getById.mockResolvedValueOnce({
      id: "test-id-hash",
      status: "pending_metadata",
      url: "https://usopc.org/stuck",
    });

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/stuck" }]),
    );

    expect(mockEntity.recordError).not.toHaveBeenCalled();
  });

  it("individual URL failures don't block others", async () => {
    mockEntity.create
      .mockRejectedValueOnce(new Error("Transient DB error"))
      .mockResolvedValueOnce({});

    await handleDiscoveryFeedMessage(
      makeMessage([
        { url: "https://usopc.org/failing" },
        { url: "https://usopc.org/succeeding" },
      ]),
    );

    // Second URL should still be processed
    expect(mockEvalService.evaluateMetadata).toHaveBeenCalledTimes(1);
    expect(mockEvalService.evaluateMetadata).toHaveBeenCalledWith(
      "https://usopc.org/succeeding",
      "Test Title",
      "usopc.org",
    );
  });

  it("records error on DB item when metadata eval fails", async () => {
    mockEntity.create.mockResolvedValue({});
    mockEvalService.evaluateMetadata.mockRejectedValueOnce(
      new Error("Anthropic API credit exhausted"),
    );

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }]),
    );

    expect(mockEntity.recordError).toHaveBeenCalledWith(
      "test-id-hash",
      "Anthropic API credit exhausted",
    );
  });

  it("re-evaluates existing pending_metadata record instead of skipping", async () => {
    mockEntity.create.mockRejectedValueOnce(pgUniqueViolation());
    mockEntity.getById.mockResolvedValueOnce({
      id: "test-id-hash",
      status: "pending_metadata",
      url: "https://usopc.org/stuck",
    });

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/stuck" }]),
    );

    expect(mockEvalService.evaluateMetadata).toHaveBeenCalled();
  });

  it("re-evaluates existing pending_content record instead of skipping", async () => {
    mockEntity.create.mockRejectedValueOnce(pgUniqueViolation());
    mockEntity.getById.mockResolvedValueOnce({
      id: "test-id-hash",
      status: "pending_content",
      url: "https://usopc.org/stuck",
    });

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/stuck" }]),
    );

    expect(mockEvalService.evaluateMetadata).toHaveBeenCalled();
  });

  it("still skips existing approved record", async () => {
    mockEntity.create.mockRejectedValueOnce(pgUniqueViolation());
    mockEntity.getById.mockResolvedValueOnce({
      id: "test-id-hash",
      status: "approved",
      url: "https://usopc.org/approved",
    });

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/approved" }]),
    );

    expect(mockEvalService.evaluateMetadata).not.toHaveBeenCalled();
  });

  it("clears error after successful re-evaluation of stuck URL", async () => {
    mockEntity.create.mockRejectedValueOnce(pgUniqueViolation());
    mockEntity.getById.mockResolvedValueOnce({
      id: "test-id-hash",
      status: "pending_metadata",
      url: "https://usopc.org/stuck",
    });

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/stuck" }]),
    );

    expect(mockEntity.clearError).toHaveBeenCalledWith("test-id-hash");
  });

  it("does not call clearError for fresh URLs", async () => {
    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }]),
    );

    expect(mockEntity.clearError).not.toHaveBeenCalled();
  });

  it("uses autoApprovalThreshold from message when provided", async () => {
    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }], {
        autoApprovalThreshold: 0.9,
      }),
    );

    expect(mockEntity.markContentEvaluated).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
      expect.any(String),
      0.9,
    );
  });

  it("rejects URL after MAX_EXTRACTION_ERRORS consecutive failures", async () => {
    mockEntity.create.mockResolvedValue({});
    mockEvalService.evaluateMetadata.mockRejectedValueOnce(
      new Error("Content extraction failed"),
    );
    mockEntity.recordError.mockResolvedValueOnce({ errorCount: 3 });

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }]),
    );

    expect(mockEntity.recordError).toHaveBeenCalledWith(
      "test-id-hash",
      "Content extraction failed",
    );
    expect(mockEntity.update).toHaveBeenCalledWith("test-id-hash", {
      status: "rejected",
      rejectionReason: expect.stringContaining(
        "Permanently failed after 3 extraction errors",
      ),
    });
  });

  it("does not reject URL when errorCount is below threshold", async () => {
    mockEntity.create.mockResolvedValue({});
    mockEvalService.evaluateMetadata.mockRejectedValueOnce(
      new Error("Transient error"),
    );
    mockEntity.recordError.mockResolvedValueOnce({ errorCount: 2 });

    await handleDiscoveryFeedMessage(
      makeMessage([{ url: "https://usopc.org/doc1" }]),
    );

    expect(mockEntity.recordError).toHaveBeenCalled();
    expect(mockEntity.update).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "rejected" }),
    );
  });
});
