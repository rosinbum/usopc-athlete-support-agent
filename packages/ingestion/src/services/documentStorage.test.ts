import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { sdkStreamMixin } from "@smithy/util-stream";

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
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({ send: mockSend })),
  PutObjectCommand: vi.fn((input: unknown) => ({ _type: "put", input })),
  GetObjectCommand: vi.fn((input: unknown) => ({ _type: "get", input })),
  HeadObjectCommand: vi.fn((input: unknown) => ({ _type: "head", input })),
}));

// Import after mocks
import { DocumentStorageService } from "./documentStorage.js";
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockS3Body(content: string): ReturnType<typeof sdkStreamMixin> {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return sdkStreamMixin(stream);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DocumentStorageService", () => {
  let service: DocumentStorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentStorageService("test-bucket");
  });

  describe("buildKey", () => {
    it("generates correct key format", () => {
      // Access private method via workaround
      const key = (service as any).buildKey("source-123", "abc123hash", "pdf");
      expect(key).toBe("sources/source-123/abc123hash.pdf");
    });

    it("handles different formats", () => {
      expect((service as any).buildKey("src", "hash", "html")).toBe(
        "sources/src/hash.html",
      );
      expect((service as any).buildKey("src", "hash", "text")).toBe(
        "sources/src/hash.text",
      );
    });
  });

  describe("storeDocument", () => {
    it("uploads document to correct S3 key", async () => {
      mockSend.mockResolvedValueOnce({ VersionId: "v1" });

      const content = Buffer.from("document content");
      const result = await service.storeDocument(
        "source-123",
        content,
        "abc123hash",
        "pdf",
      );

      expect(result.key).toBe("sources/source-123/abc123hash.pdf");
      expect(result.versionId).toBe("v1");
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: "test-bucket",
        Key: "sources/source-123/abc123hash.pdf",
        Body: content,
        ContentType: "application/pdf",
        Metadata: {},
      });
    });

    it("sets correct content type for PDF", async () => {
      mockSend.mockResolvedValueOnce({ VersionId: "v1" });

      await service.storeDocument("source", Buffer.from("data"), "hash", "pdf");

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: "application/pdf",
        }),
      );
    });

    it("sets correct content type for HTML", async () => {
      mockSend.mockResolvedValueOnce({ VersionId: "v1" });

      await service.storeDocument(
        "source",
        Buffer.from("data"),
        "hash",
        "html",
      );

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: "text/html",
        }),
      );
    });

    it("sets correct content type for text", async () => {
      mockSend.mockResolvedValueOnce({ VersionId: "v1" });

      await service.storeDocument(
        "source",
        Buffer.from("data"),
        "hash",
        "text",
      );

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: "text/plain",
        }),
      );
    });

    it("includes custom metadata when provided", async () => {
      mockSend.mockResolvedValueOnce({ VersionId: "v1" });

      await service.storeDocument(
        "source",
        Buffer.from("data"),
        "hash",
        "pdf",
        { sourceUrl: "https://example.com/doc.pdf", title: "Test Doc" },
      );

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: {
            sourceUrl: "https://example.com/doc.pdf",
            title: "Test Doc",
          },
        }),
      );
    });

    it("returns undefined versionId when not provided", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await service.storeDocument(
        "source",
        Buffer.from("data"),
        "hash",
        "pdf",
      );

      expect(result.versionId).toBeUndefined();
    });
  });

  describe("getDocument", () => {
    it("retrieves document content from S3", async () => {
      const body = createMockS3Body("document content");
      mockSend.mockResolvedValueOnce({ Body: body });

      const content = await service.getDocument(
        "sources/source-123/abc123hash.pdf",
      );

      expect(content.toString()).toBe("document content");
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: "test-bucket",
        Key: "sources/source-123/abc123hash.pdf",
      });
    });

    it("throws error when body is missing", async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(
        service.getDocument("sources/source/hash.pdf"),
      ).rejects.toThrow("No body in response");
    });
  });

  describe("documentExists", () => {
    it("returns true when document exists", async () => {
      mockSend.mockResolvedValueOnce({});

      const exists = await service.documentExists(
        "sources/source-123/abc123hash.pdf",
      );

      expect(exists).toBe(true);
      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: "test-bucket",
        Key: "sources/source-123/abc123hash.pdf",
      });
    });

    it("returns false when document does not exist (NotFound)", async () => {
      const error = new Error("Not Found");
      error.name = "NotFound";
      mockSend.mockRejectedValueOnce(error);

      const exists = await service.documentExists("sources/missing/hash.pdf");

      expect(exists).toBe(false);
    });

    it("returns false when document does not exist (NoSuchKey)", async () => {
      const error = new Error("No Such Key");
      error.name = "NoSuchKey";
      mockSend.mockRejectedValueOnce(error);

      const exists = await service.documentExists("sources/missing/hash.pdf");

      expect(exists).toBe(false);
    });

    it("throws other errors", async () => {
      const error = new Error("Access Denied");
      error.name = "AccessDenied";
      mockSend.mockRejectedValueOnce(error);

      await expect(
        service.documentExists("sources/protected/hash.pdf"),
      ).rejects.toThrow("Access Denied");
    });
  });

  describe("getKeyForSource", () => {
    it("generates key for a source and hash", () => {
      const key = service.getKeyForSource("my-source", "content-hash", "pdf");
      expect(key).toBe("sources/my-source/content-hash.pdf");
    });
  });
});
