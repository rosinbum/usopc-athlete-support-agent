import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQSEvent } from "aws-lambda";
import type { DiscoveryFeedMessage } from "@usopc/core";

// Mock @usopc/shared
vi.mock("@usopc/shared", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  getSecretValue: vi.fn(() => "test-anthropic-key"),
  createAppTable: vi.fn(() => ({})),
  DiscoveredSourceEntity: vi.fn(),
}));

// Mock SST Resource
vi.mock("sst", () => ({
  Resource: {
    AppTable: { name: "test-table" },
  },
}));

// Mock @usopc/core
vi.mock("@usopc/core", () => ({
  normalizeUrl: vi.fn((url: string) => url),
  urlToId: vi.fn(() => "test-id-hash"),
}));

// Mock EvaluationService
vi.mock("./services/evaluationService.js", () => ({
  EvaluationService: vi.fn(),
}));

// Mock loadWeb
vi.mock("./loaders/index.js", () => ({
  loadWeb: vi.fn(),
}));

import { DiscoveredSourceEntity } from "@usopc/shared";
import { normalizeUrl } from "@usopc/core";
import { EvaluationService } from "./services/evaluationService.js";
import { loadWeb } from "./loaders/index.js";
import { handler } from "./discoveryFeedWorker.js";

const MockDiscoveredSourceEntity = vi.mocked(DiscoveredSourceEntity);
const MockEvaluationService = vi.mocked(EvaluationService);
const mockLoadWeb = vi.mocked(loadWeb);
const mockNormalizeUrl = vi.mocked(normalizeUrl);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(messages: DiscoveryFeedMessage[]): SQSEvent {
  return {
    Records: messages.map((msg, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `handle-${i}`,
      body: JSON.stringify(msg),
      attributes: {} as any,
      messageAttributes: {},
      md5OfBody: "",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:000:queue",
      awsRegion: "us-east-1",
    })),
  };
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
    MockDiscoveredSourceEntity.mockImplementation(() => mockEntity as any);

    mockEvalService = makeMockEvalService();
    MockEvaluationService.mockImplementation(() => mockEvalService as any);

    mockLoadWeb.mockResolvedValue([
      { pageContent: "Test content", metadata: {} } as any,
    ]);

    mockNormalizeUrl.mockImplementation((url) => url);
  });

  it("parses SQS message body correctly", async () => {
    const event = makeEvent([makeMessage([{ url: "https://usopc.org/doc1" }])]);

    await handler(event);

    expect(mockEntity.create).toHaveBeenCalledTimes(1);
  });

  it("creates DiscoveredSource entries with correct fields", async () => {
    const event = makeEvent([
      makeMessage([
        { url: "https://usopc.org/doc1", title: "USOPC Selection" },
      ]),
    ]);

    await handler(event);

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
    const event = makeEvent([
      makeMessage([
        { url: "https://usopc.org/doc1", title: "USOPC Selection" },
      ]),
    ]);

    await handler(event);

    expect(mockEvalService.evaluateMetadata).toHaveBeenCalledWith(
      "https://usopc.org/doc1",
      "USOPC Selection",
      "usopc.org",
    );
  });

  it("calls markMetadataEvaluated with LLM results", async () => {
    const event = makeEvent([makeMessage([{ url: "https://usopc.org/doc1" }])]);

    await handler(event);

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

    const event = makeEvent([makeMessage([{ url: "https://usopc.org/doc1" }])]);

    await handler(event);

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

    const event = makeEvent([makeMessage([{ url: "https://usopc.org/doc1" }])]);

    await handler(event);

    expect(mockLoadWeb).not.toHaveBeenCalled();
  });

  it("calls loadWeb, evaluateContent, markContentEvaluated for passing metadata", async () => {
    const event = makeEvent([makeMessage([{ url: "https://usopc.org/doc1" }])]);

    await handler(event);

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

  it("skips existing URLs (conditional put failure)", async () => {
    mockEntity.create.mockRejectedValueOnce(
      new Error("Conditional check failed"),
    );

    const event = makeEvent([
      makeMessage([{ url: "https://usopc.org/existing" }]),
    ]);

    await handler(event);

    expect(mockEvalService.evaluateMetadata).not.toHaveBeenCalled();
    expect(mockLoadWeb).not.toHaveBeenCalled();
  });

  it("individual URL failures don't block others", async () => {
    mockEntity.create
      .mockRejectedValueOnce(new Error("DynamoDB transient error"))
      .mockResolvedValueOnce({});

    const event = makeEvent([
      makeMessage([
        { url: "https://usopc.org/failing" },
        { url: "https://usopc.org/succeeding" },
      ]),
    ]);

    await handler(event);

    // Second URL should still be processed
    expect(mockEvalService.evaluateMetadata).toHaveBeenCalledTimes(1);
    expect(mockEvalService.evaluateMetadata).toHaveBeenCalledWith(
      "https://usopc.org/succeeding",
      "Test Title",
      "usopc.org",
    );
  });

  it("returns batchItemFailures for malformed JSON", async () => {
    const event: SQSEvent = {
      Records: [
        {
          messageId: "bad-msg",
          receiptHandle: "handle",
          body: "not json",
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: "",
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:us-east-1:000:queue",
          awsRegion: "us-east-1",
        },
      ],
    };

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "bad-msg" }]);
  });

  it("uses autoApprovalThreshold from message when provided", async () => {
    const event = makeEvent([
      makeMessage([{ url: "https://usopc.org/doc1" }], {
        autoApprovalThreshold: 0.9,
      }),
    ]);

    await handler(event);

    expect(mockEntity.markContentEvaluated).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
      expect.any(String),
      0.9,
    );
  });
});
