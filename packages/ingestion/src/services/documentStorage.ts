import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createLogger } from "@usopc/shared";

const logger = createLogger({ service: "document-storage" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoreDocumentResult {
  key: string;
  versionId?: string | undefined;
}

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
 * Service for storing and retrieving documents in S3.
 *
 * Key format: `sources/{sourceId}/{contentHash}.{format}`
 *
 * Features:
 * - Store documents with content-addressed keys (hash-based)
 * - S3 versioning for audit trail
 * - Custom metadata support
 */
export class DocumentStorageService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(bucketName: string, s3Client?: S3Client) {
    this.bucketName = bucketName;
    this.s3Client = s3Client ?? new S3Client({});
  }

  /**
   * Build the S3 key for a document.
   * Format: sources/{sourceId}/{contentHash}.{format}
   */
  private buildKey(
    sourceId: string,
    contentHash: string,
    format: DocumentFormat | string,
  ): string {
    return `sources/${sourceId}/${contentHash}.${format}`;
  }

  /**
   * Get the content type for a document format.
   */
  private getContentType(format: DocumentFormat | string): string {
    return (
      CONTENT_TYPE_MAP[format as DocumentFormat] ?? "application/octet-stream"
    );
  }

  /**
   * Store a document in S3.
   *
   * @param sourceId - Source identifier
   * @param content - Document content as Buffer
   * @param contentHash - SHA-256 hash of the content
   * @param format - Document format (pdf, html, text)
   * @param metadata - Optional custom metadata
   * @returns The S3 key and version ID
   */
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

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: content,
      ContentType: contentType,
      Metadata: metadata ?? {},
    });

    const response = await this.s3Client.send(command);

    logger.info(`Document stored: ${key}`, {
      versionId: response.VersionId,
    });

    return {
      key,
      versionId: response.VersionId,
    };
  }

  /**
   * Retrieve a document from S3.
   *
   * @param key - The S3 key
   * @returns The document content as Buffer
   */
  async getDocument(key: string): Promise<Buffer> {
    logger.debug(`Retrieving document: ${key}`);

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error(`No body in response for key: ${key}`);
    }

    // Convert the readable stream to a Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Check if a document exists in S3.
   *
   * @param key - The S3 key
   * @returns true if the document exists
   */
  async documentExists(key: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NotFound" || error.name === "NoSuchKey")
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get the S3 key for a source and content hash.
   * Useful for checking if a document already exists before fetching.
   */
  getKeyForSource(
    sourceId: string,
    contentHash: string,
    format: DocumentFormat | string,
  ): string {
    return this.buildKey(sourceId, contentHash, format);
  }
}
