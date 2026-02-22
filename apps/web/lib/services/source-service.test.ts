import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDeleteChunks = vi.fn().mockResolvedValue(0);
const mockUpdateChunkMetadata = vi.fn().mockResolvedValue(0);

vi.mock("@usopc/shared", () => ({
  deleteChunksBySourceId: (...args: unknown[]) => mockDeleteChunks(...args),
  updateChunkMetadataBySourceId: (...args: unknown[]) =>
    mockUpdateChunkMetadata(...args),
  getResource: vi.fn((key: string) => {
    if (key === "IngestionQueue")
      return { url: "https://sqs.us-east-1.amazonaws.com/test-queue" };
    throw new Error(`SST Resource '${key}' not available`);
  }),
  getPool: () => "mock-pool",
  logger: {
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  },
}));

const mockSqsSend = vi.fn();
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn(() => ({ send: mockSqsSend })),
  SendMessageCommand: vi.fn((input: unknown) => input),
}));

import {
  buildIngestionMessage,
  triggerIngestion,
  deleteSource,
  updateSource,
  CONTENT_AFFECTING_FIELDS,
  METADATA_FIELDS,
} from "./source-service.js";

const SAMPLE_SOURCE = {
  id: "usopc-bylaws",
  title: "USOPC Bylaws",
  documentType: "bylaws",
  topicDomains: ["governance"],
  url: "https://example.com/bylaws.pdf",
  format: "pdf" as const,
  ngbId: null,
  priority: "high" as const,
  description: "Bylaws doc",
  authorityLevel: "usopc_governance" as const,
  enabled: true,
  lastIngestedAt: null,
  lastContentHash: null,
  consecutiveFailures: 0,
  lastError: null,
  s3Key: null,
  s3VersionId: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// ===========================================================================
// buildIngestionMessage
// ===========================================================================

describe("buildIngestionMessage", () => {
  it("builds a message with source fields and metadata", () => {
    const msg = buildIngestionMessage(SAMPLE_SOURCE);

    expect(msg.source.id).toBe("usopc-bylaws");
    expect(msg.source.title).toBe("USOPC Bylaws");
    expect(msg.source.url).toBe("https://example.com/bylaws.pdf");
    expect(msg.source.format).toBe("pdf");
    expect(msg.source.documentType).toBe("bylaws");
    expect(msg.source.topicDomains).toEqual(["governance"]);
    expect(msg.source.ngbId).toBeNull();
    expect(msg.source.priority).toBe("high");
    expect(msg.source.description).toBe("Bylaws doc");
    expect(msg.source.authorityLevel).toBe("usopc_governance");
    expect(msg.contentHash).toBe("manual");
    expect(msg.triggeredAt).toBeDefined();
  });

  it("does not include internal fields like enabled or createdAt", () => {
    const msg = buildIngestionMessage(SAMPLE_SOURCE);
    const keys = Object.keys(msg.source);

    expect(keys).not.toContain("enabled");
    expect(keys).not.toContain("createdAt");
    expect(keys).not.toContain("lastIngestedAt");
  });
});

// ===========================================================================
// triggerIngestion
// ===========================================================================

describe("triggerIngestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends SQS message and returns triggered: true", async () => {
    mockSqsSend.mockResolvedValueOnce({});

    const result = await triggerIngestion(SAMPLE_SOURCE);

    expect(result).toEqual({ triggered: true });
    expect(mockSqsSend).toHaveBeenCalledOnce();
  });

  it("throws when SQS send fails", async () => {
    mockSqsSend.mockRejectedValueOnce(new Error("SQS error"));

    await expect(triggerIngestion(SAMPLE_SOURCE)).rejects.toThrow("SQS error");
  });
});

// ===========================================================================
// deleteSource
// ===========================================================================

describe("deleteSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes chunks then config and returns chunk count", async () => {
    mockDeleteChunks.mockResolvedValueOnce(15);
    const mockEntityDelete = vi.fn().mockResolvedValue(undefined);
    const entity = { delete: mockEntityDelete } as never;

    const result = await deleteSource("src-1", entity, "mock-pool" as never);

    expect(result).toEqual({ chunksDeleted: 15 });
    expect(mockDeleteChunks).toHaveBeenCalledWith("mock-pool", "src-1");
    expect(mockEntityDelete).toHaveBeenCalledWith("src-1");
  });

  it("calls delete in correct order (chunks before config)", async () => {
    const callOrder: string[] = [];
    mockDeleteChunks.mockImplementationOnce(() => {
      callOrder.push("chunks");
      return Promise.resolve(0);
    });
    const entity = {
      delete: vi.fn().mockImplementation(() => {
        callOrder.push("config");
        return Promise.resolve(undefined);
      }),
    } as never;

    await deleteSource("src-1", entity, "mock-pool" as never);

    expect(callOrder).toEqual(["chunks", "config"]);
  });
});

// ===========================================================================
// updateSource
// ===========================================================================

describe("updateSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles no-vector-impact fields (enabled only)", async () => {
    const updated = { ...SAMPLE_SOURCE, enabled: false };
    const entity = {
      update: vi.fn().mockResolvedValueOnce(updated),
    } as never;

    const result = await updateSource(
      "usopc-bylaws",
      { enabled: false },
      entity,
      "mock-pool" as never,
    );

    expect(result.source.enabled).toBe(false);
    expect(result.actions).toEqual({});
    expect(mockDeleteChunks).not.toHaveBeenCalled();
    expect(mockUpdateChunkMetadata).not.toHaveBeenCalled();
  });

  it("updates metadata fields and syncs chunks", async () => {
    const updated = { ...SAMPLE_SOURCE, title: "Updated Title" };
    const entity = {
      update: vi.fn().mockResolvedValueOnce(updated),
    } as never;
    mockUpdateChunkMetadata.mockResolvedValueOnce(5);

    const result = await updateSource(
      "usopc-bylaws",
      { title: "Updated Title" },
      entity,
      "mock-pool" as never,
    );

    expect(result.source.title).toBe("Updated Title");
    expect(result.actions.chunksUpdated).toBe(5);
    expect(mockUpdateChunkMetadata).toHaveBeenCalledWith(
      "mock-pool",
      "usopc-bylaws",
      { title: "Updated Title" },
    );
  });

  it("deletes chunks and triggers re-ingestion for content changes", async () => {
    const updated = { ...SAMPLE_SOURCE, url: "https://example.com/new.pdf" };
    const entity = {
      update: vi.fn().mockResolvedValueOnce(updated),
    } as never;
    mockDeleteChunks.mockResolvedValueOnce(10);
    mockSqsSend.mockResolvedValueOnce({});

    const result = await updateSource(
      "usopc-bylaws",
      { url: "https://example.com/new.pdf" },
      entity,
      "mock-pool" as never,
    );

    expect(result.actions.chunksDeleted).toBe(10);
    expect(result.actions.reIngestionTriggered).toBe(true);
    expect(mockDeleteChunks).toHaveBeenCalledWith("mock-pool", "usopc-bylaws");
    expect(mockSqsSend).toHaveBeenCalledOnce();
  });

  it("content-affecting change wins over metadata change", async () => {
    const updated = {
      ...SAMPLE_SOURCE,
      url: "https://example.com/new.pdf",
      title: "New Title",
    };
    const entity = {
      update: vi.fn().mockResolvedValueOnce(updated),
    } as never;
    mockDeleteChunks.mockResolvedValueOnce(3);
    mockSqsSend.mockResolvedValueOnce({});

    const result = await updateSource(
      "usopc-bylaws",
      { url: "https://example.com/new.pdf", title: "New Title" },
      entity,
      "mock-pool" as never,
    );

    expect(result.actions.chunksDeleted).toBe(3);
    expect(result.actions.reIngestionTriggered).toBe(true);
    expect(mockUpdateChunkMetadata).not.toHaveBeenCalled();
  });

  it("proceeds with update when SQS fails for content change", async () => {
    const updated = { ...SAMPLE_SOURCE, url: "https://example.com/new.pdf" };
    const entity = {
      update: vi.fn().mockResolvedValueOnce(updated),
    } as never;
    mockDeleteChunks.mockResolvedValueOnce(2);
    mockSqsSend.mockRejectedValueOnce(new Error("SQS unavailable"));

    const result = await updateSource(
      "usopc-bylaws",
      { url: "https://example.com/new.pdf" },
      entity,
      "mock-pool" as never,
    );

    expect(result.actions.reIngestionTriggered).toBe(false);
    expect(result.source.url).toBe("https://example.com/new.pdf");
  });
});

// ===========================================================================
// Field sets
// ===========================================================================

describe("field sets", () => {
  it("CONTENT_AFFECTING_FIELDS contains url and format", () => {
    expect(CONTENT_AFFECTING_FIELDS.has("url")).toBe(true);
    expect(CONTENT_AFFECTING_FIELDS.has("format")).toBe(true);
    expect(CONTENT_AFFECTING_FIELDS.size).toBe(2);
  });

  it("METADATA_FIELDS contains expected fields", () => {
    expect(METADATA_FIELDS.has("title")).toBe(true);
    expect(METADATA_FIELDS.has("documentType")).toBe(true);
    expect(METADATA_FIELDS.has("topicDomains")).toBe(true);
    expect(METADATA_FIELDS.has("ngbId")).toBe(true);
    expect(METADATA_FIELDS.has("authorityLevel")).toBe(true);
    expect(METADATA_FIELDS.size).toBe(5);
  });
});
