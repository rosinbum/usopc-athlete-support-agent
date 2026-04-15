import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StorageService } from "@usopc/shared";

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
  createStorageService: vi.fn(),
}));

import { DocumentStorageService } from "./documentStorage.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStorage(): StorageService & {
  storeDocument: ReturnType<typeof vi.fn>;
  getDocument: ReturnType<typeof vi.fn>;
  documentExists: ReturnType<typeof vi.fn>;
  getSignedUrl: ReturnType<typeof vi.fn>;
} {
  return {
    storeDocument: vi.fn().mockResolvedValue({ key: "", versionId: "v1" }),
    getDocument: vi.fn().mockResolvedValue(Buffer.from("content")),
    documentExists: vi.fn().mockResolvedValue(true),
    getSignedUrl: vi.fn().mockResolvedValue("https://signed.url"),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DocumentStorageService", () => {
  let service: DocumentStorageService;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    // Pass the mock storage as the second argument
    service = new DocumentStorageService("test-bucket", mockStorage);
  });

  describe("buildKey", () => {
    it("generates correct key format", () => {
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
    it("uploads document to correct key", async () => {
      mockStorage.storeDocument.mockResolvedValueOnce({
        key: "sources/source-123/abc123hash.pdf",
        versionId: "v1",
      });

      const content = Buffer.from("document content");
      const result = await service.storeDocument(
        "source-123",
        content,
        "abc123hash",
        "pdf",
      );

      expect(result.key).toBe("sources/source-123/abc123hash.pdf");
      expect(result.versionId).toBe("v1");
      expect(mockStorage.storeDocument).toHaveBeenCalledWith(
        "sources/source-123/abc123hash.pdf",
        content,
        "application/pdf",
        undefined,
      );
    });

    it("sets correct content type for PDF", async () => {
      await service.storeDocument("source", Buffer.from("data"), "hash", "pdf");

      expect(mockStorage.storeDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        "application/pdf",
        undefined,
      );
    });

    it("sets correct content type for HTML", async () => {
      await service.storeDocument(
        "source",
        Buffer.from("data"),
        "hash",
        "html",
      );

      expect(mockStorage.storeDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        "text/html",
        undefined,
      );
    });

    it("sets correct content type for text", async () => {
      await service.storeDocument(
        "source",
        Buffer.from("data"),
        "hash",
        "text",
      );

      expect(mockStorage.storeDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        "text/plain",
        undefined,
      );
    });

    it("includes custom metadata when provided", async () => {
      const meta = { sourceUrl: "https://example.com/doc.pdf", title: "Doc" };
      await service.storeDocument(
        "source",
        Buffer.from("data"),
        "hash",
        "pdf",
        meta,
      );

      expect(mockStorage.storeDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        "application/pdf",
        meta,
      );
    });

    it("returns undefined versionId when not provided", async () => {
      mockStorage.storeDocument.mockResolvedValueOnce({
        key: "sources/source/hash.pdf",
      });

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
    it("retrieves document content", async () => {
      mockStorage.getDocument.mockResolvedValueOnce(
        Buffer.from("document content"),
      );

      const content = await service.getDocument(
        "sources/source-123/abc123hash.pdf",
      );

      expect(content.toString()).toBe("document content");
      expect(mockStorage.getDocument).toHaveBeenCalledWith(
        "sources/source-123/abc123hash.pdf",
      );
    });
  });

  describe("documentExists", () => {
    it("returns true when document exists", async () => {
      mockStorage.documentExists.mockResolvedValueOnce(true);

      const exists = await service.documentExists(
        "sources/source-123/abc123hash.pdf",
      );

      expect(exists).toBe(true);
    });

    it("returns false when document does not exist", async () => {
      mockStorage.documentExists.mockResolvedValueOnce(false);

      const exists = await service.documentExists("sources/missing/hash.pdf");

      expect(exists).toBe(false);
    });
  });

  describe("buildKey - input sanitization", () => {
    it("strips path traversal sequences from sourceId", () => {
      const key = (service as any).buildKey(
        "../../etc/passwd",
        "abc123",
        "pdf",
      );
      expect(key).toBe("sources/______etc_passwd/abc123.pdf");
    });

    it("strips path traversal from contentHash", () => {
      const key = (service as any).buildKey(
        "safe-source",
        "../../../hack",
        "pdf",
      );
      expect(key).toBe("sources/safe-source/_________hack.pdf");
    });

    it("rejects empty sourceId", () => {
      expect(() => (service as any).buildKey("", "hash", "pdf")).toThrow(
        "Storage key segment must not be empty",
      );
    });

    it("rejects sourceId with null bytes", () => {
      expect(() =>
        (service as any).buildKey("bad\x00source", "hash", "pdf"),
      ).toThrow("Storage key segment must not contain null bytes");
    });

    it("passes through valid sourceIds unchanged", () => {
      const key = (service as any).buildKey(
        "my-source_123",
        "abc123DEF",
        "pdf",
      );
      expect(key).toBe("sources/my-source_123/abc123DEF.pdf");
    });

    it("sanitizes slashes in sourceId", () => {
      const key = (service as any).buildKey("foo/bar", "hash", "pdf");
      expect(key).toBe("sources/foo_bar/hash.pdf");
    });
  });

  describe("getKeyForSource", () => {
    it("generates key for a source and hash", () => {
      const key = service.getKeyForSource("my-source", "content-hash", "pdf");
      expect(key).toBe("sources/my-source/content-hash.pdf");
    });
  });
});
