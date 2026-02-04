import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@usopc/shared", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

const mockSend = vi.fn();
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockSend })),
  },
  PutCommand: vi.fn((input: unknown) => ({ _type: "put", input })),
  GetCommand: vi.fn((input: unknown) => ({ _type: "get", input })),
  QueryCommand: vi.fn((input: unknown) => ({ _type: "query", input })),
  UpdateCommand: vi.fn((input: unknown) => ({ _type: "update", input })),
  DeleteCommand: vi.fn((input: unknown) => ({ _type: "delete", input })),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(),
}));

// Import after mocks
import {
  SourceConfigEntity,
  type SourceConfig,
  type CreateSourceInput,
} from "./SourceConfigEntity.js";
import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_SOURCE: SourceConfig = {
  id: "usopc-bylaws",
  title: "USOPC Bylaws",
  documentType: "bylaws",
  topicDomains: ["governance", "athlete_rights"],
  url: "https://example.com/bylaws.pdf",
  format: "pdf",
  ngbId: null,
  priority: "high",
  description: "Official USOPC bylaws document",
  authorityLevel: "usopc_governance",
  enabled: true,
  lastIngestedAt: null,
  lastContentHash: null,
  consecutiveFailures: 0,
  lastError: null,
  s3Key: null,
  s3VersionId: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

function createSampleInput(): CreateSourceInput {
  return {
    id: "usopc-bylaws",
    title: "USOPC Bylaws",
    documentType: "bylaws",
    topicDomains: ["governance", "athlete_rights"],
    url: "https://example.com/bylaws.pdf",
    format: "pdf",
    ngbId: null,
    priority: "high",
    description: "Official USOPC bylaws document",
    authorityLevel: "usopc_governance",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SourceConfigEntity", () => {
  let entity: SourceConfigEntity;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
    entity = new SourceConfigEntity("test-table");
  });

  describe("create", () => {
    it("generates correct pk/sk and timestamps", async () => {
      mockSend.mockResolvedValueOnce({});

      const input = createSampleInput();
      const result = await entity.create(input);

      expect(PutCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "test-table",
          Item: expect.objectContaining({
            pk: "SOURCE#usopc-bylaws",
            sk: "CONFIG",
            id: "usopc-bylaws",
            createdAt: "2024-01-15T12:00:00.000Z",
            updatedAt: "2024-01-15T12:00:00.000Z",
            enabled: "true", // Stored as string for GSI
            consecutiveFailures: 0,
          }),
        }),
      );
      expect(result.id).toBe("usopc-bylaws");
      expect(result.createdAt).toBe("2024-01-15T12:00:00.000Z");
    });

    it("initializes with default values", async () => {
      mockSend.mockResolvedValueOnce({});

      const input = createSampleInput();
      const result = await entity.create(input);

      expect(result.enabled).toBe(true);
      expect(result.consecutiveFailures).toBe(0);
      expect(result.lastIngestedAt).toBeNull();
      expect(result.lastContentHash).toBeNull();
      expect(result.lastError).toBeNull();
      expect(result.s3Key).toBeNull();
      expect(result.s3VersionId).toBeNull();
    });
  });

  describe("getById", () => {
    it("returns null for missing item", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await entity.getById("nonexistent");

      expect(result).toBeNull();
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: "test-table",
        Key: {
          pk: "SOURCE#nonexistent",
          sk: "CONFIG",
        },
      });
    });

    it("unmarshalls DynamoDB item correctly", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          pk: "SOURCE#usopc-bylaws",
          sk: "CONFIG",
          ...SAMPLE_SOURCE,
        },
      });

      const result = await entity.getById("usopc-bylaws");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("usopc-bylaws");
      expect(result!.title).toBe("USOPC Bylaws");
      expect(result!.topicDomains).toEqual(["governance", "athlete_rights"]);
      expect(result!.format).toBe("pdf");
      expect(result!.authorityLevel).toBe("usopc_governance");
    });
  });

  describe("getAllEnabled", () => {
    it("filters by enabled=true using GSI", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          { pk: "SOURCE#src1", sk: "CONFIG", ...SAMPLE_SOURCE, id: "src1" },
          { pk: "SOURCE#src2", sk: "CONFIG", ...SAMPLE_SOURCE, id: "src2" },
        ],
      });

      const results = await entity.getAllEnabled();

      expect(results).toHaveLength(2);
      expect(QueryCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "test-table",
          IndexName: "enabled-priority-index",
          KeyConditionExpression: "enabled = :enabled",
          ExpressionAttributeValues: {
            ":enabled": "true",
          },
        }),
      );
    });

    it("returns empty array when no enabled sources", async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const results = await entity.getAllEnabled();

      expect(results).toEqual([]);
    });
  });

  describe("getByNgb", () => {
    it("queries GSI correctly", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            pk: "SOURCE#usa-swimming-rules",
            sk: "CONFIG",
            ...SAMPLE_SOURCE,
            id: "usa-swimming-rules",
            ngbId: "usa-swimming",
          },
        ],
      });

      const results = await entity.getByNgb("usa-swimming");

      expect(results).toHaveLength(1);
      expect(results[0].ngbId).toBe("usa-swimming");
      expect(QueryCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "test-table",
          IndexName: "ngbId-index",
          KeyConditionExpression: "ngbId = :ngbId",
          ExpressionAttributeValues: {
            ":ngbId": "usa-swimming",
          },
        }),
      );
    });
  });

  describe("update", () => {
    it("merges updates and sets updatedAt", async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          pk: "SOURCE#usopc-bylaws",
          sk: "CONFIG",
          ...SAMPLE_SOURCE,
          url: "https://example.com/new-bylaws.pdf",
          updatedAt: "2024-01-15T12:00:00.000Z",
        },
      });

      const result = await entity.update("usopc-bylaws", {
        url: "https://example.com/new-bylaws.pdf",
      });

      expect(result.url).toBe("https://example.com/new-bylaws.pdf");
      expect(UpdateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "test-table",
          Key: {
            pk: "SOURCE#usopc-bylaws",
            sk: "CONFIG",
          },
          UpdateExpression: expect.stringContaining("SET"),
          ExpressionAttributeValues: expect.objectContaining({
            ":updatedAt": "2024-01-15T12:00:00.000Z",
          }),
          ReturnValues: "ALL_NEW",
        }),
      );
    });
  });

  describe("markSuccess", () => {
    it("resets failures, sets hash, timestamp, and S3 info", async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          pk: "SOURCE#usopc-bylaws",
          sk: "CONFIG",
          ...SAMPLE_SOURCE,
          lastContentHash: "abc123hash",
          lastIngestedAt: "2024-01-15T12:00:00.000Z",
          consecutiveFailures: 0,
          lastError: null,
          s3Key: "sources/usopc-bylaws/abc123hash.pdf",
          s3VersionId: "v1",
        },
      });

      await entity.markSuccess("usopc-bylaws", "abc123hash", {
        s3Key: "sources/usopc-bylaws/abc123hash.pdf",
        s3VersionId: "v1",
      });

      expect(UpdateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: {
            pk: "SOURCE#usopc-bylaws",
            sk: "CONFIG",
          },
          ExpressionAttributeValues: expect.objectContaining({
            ":contentHash": "abc123hash",
            ":failures": 0,
            ":lastError": null,
            ":s3Key": "sources/usopc-bylaws/abc123hash.pdf",
            ":s3VersionId": "v1",
          }),
        }),
      );
    });
  });

  describe("markFailure", () => {
    it("increments failures and sets lastError", async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          pk: "SOURCE#usopc-bylaws",
          sk: "CONFIG",
          ...SAMPLE_SOURCE,
          consecutiveFailures: 3,
          lastError: "Connection timeout",
        },
      });

      await entity.markFailure("usopc-bylaws", "Connection timeout");

      expect(UpdateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          UpdateExpression: expect.stringContaining(
            "consecutiveFailures = consecutiveFailures + :inc",
          ),
          ExpressionAttributeValues: expect.objectContaining({
            ":inc": 1,
            ":lastError": "Connection timeout",
          }),
        }),
      );
    });
  });

  describe("disable", () => {
    it("sets enabled to false", async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          ...SAMPLE_SOURCE,
          enabled: false,
        },
      });

      await entity.disable("usopc-bylaws");

      expect(UpdateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({
            ":enabled": "false",
          }),
        }),
      );
    });
  });

  describe("enable", () => {
    it("sets enabled to true", async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          ...SAMPLE_SOURCE,
          enabled: true,
        },
      });

      await entity.enable("usopc-bylaws");

      expect(UpdateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({
            ":enabled": "true",
          }),
        }),
      );
    });
  });

  describe("delete", () => {
    it("removes the item from the table", async () => {
      const { DeleteCommand } = await import("@aws-sdk/lib-dynamodb");
      mockSend.mockResolvedValueOnce({});

      await entity.delete("usopc-bylaws");

      expect(DeleteCommand).toHaveBeenCalledWith({
        TableName: "test-table",
        Key: {
          pk: "SOURCE#usopc-bylaws",
          sk: "CONFIG",
        },
      });
    });
  });
});
