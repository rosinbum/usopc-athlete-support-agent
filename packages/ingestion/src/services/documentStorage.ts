import {
  createLogger,
  createStorageService,
  type StorageService,
  type StoreDocumentResult,
} from "@usopc/shared";

export type { StoreDocumentResult };

const logger = createLogger({ service: "document-storage" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentFormat = "pdf" | "html" | "text";

// ---------------------------------------------------------------------------
// Content type mapping
// ---------------------------------------------------------------------------

const CONTENT_TYPE_MAP: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  html: "text/html",
  text: "text/plain",
};

// ---------------------------------------------------------------------------
// DocumentStorageService
// ---------------------------------------------------------------------------

/**
 * Service for storing and retrieving documents.
 *
 * Key format: `sources/{sourceId}/{contentHash}.{format}`
 *
 * Delegates to the provider-agnostic StorageService (backed by
 * Google Cloud Storage).
 */
export class DocumentStorageService {
  private storage: StorageService;

  constructor(bucketName: string, storageService?: StorageService) {
    this.storage = storageService ?? createStorageService(bucketName);
  }

  /**
   * Sanitize a key segment to prevent path traversal and invalid keys.
   */
  private sanitizeKeySegment(segment: string): string {
    if (!segment) {
      throw new Error("Storage key segment must not be empty");
    }
    if (segment.includes("\x00")) {
      throw new Error("Storage key segment must not contain null bytes");
    }
    return segment.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  /**
   * Build the object key for a document.
   */
  private buildKey(
    sourceId: string,
    contentHash: string,
    format: DocumentFormat | string,
  ): string {
    const safeSourceId = this.sanitizeKeySegment(sourceId);
    const safeContentHash = this.sanitizeKeySegment(contentHash);
    return `sources/${safeSourceId}/${safeContentHash}.${format}`;
  }

  private getContentType(format: DocumentFormat | string): string {
    return (
      CONTENT_TYPE_MAP[format as DocumentFormat] ?? "application/octet-stream"
    );
  }

  async storeDocument(
    sourceId: string,
    content: Buffer,
    contentHash: string,
    format: DocumentFormat | string,
    metadata?: Record<string, string>,
  ): Promise<StoreDocumentResult> {
    const key = this.buildKey(sourceId, contentHash, format);
    const contentType = this.getContentType(format);

    logger.info(`Storing document: ${key}`, {
      sourceId,
      contentHash,
      format,
      size: content.length,
    });

    const result = await this.storage.storeDocument(
      key,
      content,
      contentType,
      metadata,
    );

    logger.info(`Document stored: ${key}`, { versionId: result.versionId });
    return result;
  }

  async getDocument(key: string): Promise<Buffer> {
    logger.debug(`Retrieving document: ${key}`);
    return this.storage.getDocument(key);
  }

  async documentExists(key: string): Promise<boolean> {
    return this.storage.documentExists(key);
  }

  getKeyForSource(
    sourceId: string,
    contentHash: string,
    format: DocumentFormat | string,
  ): string {
    return this.buildKey(sourceId, contentHash, format);
  }
}
