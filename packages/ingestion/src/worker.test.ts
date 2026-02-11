import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQSEvent } from "aws-lambda";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIngestSource = vi.fn();

vi.mock("./pipeline.js", async () => {
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
vi.mock("./db.js", () => ({
  upsertIngestionStatus: (...args: unknown[]) =>
    mockUpsertIngestionStatus(...args),
}));

const mockSend = vi.fn();
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn(() => ({ send: mockSend })),
  PurgeQueueCommand: vi.fn((input: unknown) => ({ input })),
}));

vi.mock("sst", () => ({
  Resource: {
    IngestionQueue: {
      url: "https://sqs.us-east-1.amazonaws.com/123/queue.fifo",
    },
  },
}));

// Mock the entities module (IngestionLogEntity factory)
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
}));

vi.mock("@usopc/shared", () => ({
  getDatabaseUrl: () => "postgresql://localhost/test",
  getSecretValue: () => "sk-test-key",
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

// Import after mocks
import { handler } from "./worker.js";
import { QuotaExhaustedError } from "./pipeline.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSQSRecord(
  body: string | Record<string, unknown>,
  messageId = "msg-1",
) {
  return {
    messageId,
    receiptHandle: `receipt-${messageId}`,
    body: typeof body === "string" ? body : JSON.stringify(body),
    attributes: {
      ApproximateReceiveCount: "1",
      SentTimestamp: "0",
      SenderId: "sender",
      ApproximateFirstReceiveTimestamp: "0",
    },
    messageAttributes: {},
    md5OfBody: "md5",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:us-east-1:123:queue",
    awsRegion: "us-east-1",
  };
}

function makeSQSEvent(
  body: Record<string, unknown>,
  messageId = "msg-1",
): SQSEvent {
  return {
    Records: [makeSQSRecord(body, messageId)],
  };
}

const MESSAGE_BODY = {
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
  contentHash: "abc123",
  triggeredAt: "2025-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("worker handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertIngestionStatus.mockResolvedValue(undefined);
    mockSend.mockResolvedValue({});
  });

  it("upserts completed status and returns empty failures on success", async () => {
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "completed",
      chunksCount: 10,
    });

    const result = await handler(makeSQSEvent(MESSAGE_BODY));

    expect(result).toEqual({ batchItemFailures: [] });
    expect(mockUpsertIngestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "src-1",
      "https://example.com/doc.pdf",
      "completed",
      { contentHash: "abc123", chunksCount: 10 },
    );
  });

  it("upserts failed status and returns empty failures on graceful failure", async () => {
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "failed",
      chunksCount: 0,
      error: "load error",
    });

    const result = await handler(makeSQSEvent(MESSAGE_BODY));

    expect(result).toEqual({ batchItemFailures: [] });
    expect(mockUpsertIngestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "src-1",
      "https://example.com/doc.pdf",
      "failed",
      { errorMessage: "load error" },
    );
  });

  it("upserts quota_exceeded, purges queue, and returns empty failures on QuotaExhaustedError", async () => {
    mockIngestSource.mockRejectedValueOnce(
      new QuotaExhaustedError("insufficient_quota"),
    );

    const result = await handler(makeSQSEvent(MESSAGE_BODY));

    expect(result).toEqual({ batchItemFailures: [] });
    expect(mockUpsertIngestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "src-1",
      "https://example.com/doc.pdf",
      "quota_exceeded",
      { errorMessage: "insufficient_quota" },
    );
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("returns batchItemFailures with messageId on unexpected error", async () => {
    mockIngestSource.mockRejectedValueOnce(new Error("kaboom"));

    const result = await handler(makeSQSEvent(MESSAGE_BODY, "msg-42"));

    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: "msg-42" }],
    });
  });

  it("processes multiple records in a single event", async () => {
    const body2 = {
      ...MESSAGE_BODY,
      source: { ...MESSAGE_BODY.source, id: "src-2" },
    };

    mockIngestSource
      .mockResolvedValueOnce({
        sourceId: "src-1",
        status: "completed",
        chunksCount: 5,
      })
      .mockResolvedValueOnce({
        sourceId: "src-2",
        status: "completed",
        chunksCount: 3,
      });

    const event: SQSEvent = {
      Records: [
        makeSQSRecord(MESSAGE_BODY, "msg-1"),
        makeSQSRecord(body2, "msg-2"),
      ],
    };

    const result = await handler(event);

    expect(result).toEqual({ batchItemFailures: [] });
    expect(mockIngestSource).toHaveBeenCalledTimes(2);
    expect(mockUpsertIngestionStatus).toHaveBeenCalledTimes(2);
  });

  it("skips malformed messages and continues", async () => {
    mockIngestSource.mockResolvedValueOnce({
      sourceId: "src-1",
      status: "completed",
      chunksCount: 5,
    });

    const event: SQSEvent = {
      Records: [
        makeSQSRecord("this is not json", "msg-bad"),
        makeSQSRecord(MESSAGE_BODY, "msg-1"),
      ],
    };

    const result = await handler(event);

    expect(result).toEqual({ batchItemFailures: [] });
    expect(mockIngestSource).toHaveBeenCalledTimes(1);
  });

  it("marks remaining records as failures on QuotaExhaustedError", async () => {
    mockIngestSource.mockRejectedValueOnce(
      new QuotaExhaustedError("quota hit"),
    );

    const body2 = {
      ...MESSAGE_BODY,
      source: { ...MESSAGE_BODY.source, id: "src-2" },
    };
    const body3 = {
      ...MESSAGE_BODY,
      source: { ...MESSAGE_BODY.source, id: "src-3" },
    };

    const event: SQSEvent = {
      Records: [
        makeSQSRecord(MESSAGE_BODY, "msg-1"),
        makeSQSRecord(body2, "msg-2"),
        makeSQSRecord(body3, "msg-3"),
      ],
    };

    const result = await handler(event);

    // The first record hit quota; remaining two should be batch failures
    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: "msg-2" },
      { itemIdentifier: "msg-3" },
    ]);
    expect(mockIngestSource).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledOnce();
  });
});
