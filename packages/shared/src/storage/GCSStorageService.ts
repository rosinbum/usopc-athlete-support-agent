import { Storage } from "@google-cloud/storage";
import type { StorageService, StoreDocumentResult } from "./StorageService.js";

export class GCSStorageService implements StorageService {
  private storage: Storage;
  private bucket: string;

  constructor(bucket: string, storage?: Storage) {
    this.bucket = bucket;
    this.storage = storage ?? new Storage();
  }

  async storeDocument(
    key: string,
    content: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<StoreDocumentResult> {
    const file = this.storage.bucket(this.bucket).file(key);
    if (metadata) {
      await file.save(content, { contentType, metadata: { metadata } });
    } else {
      await file.save(content, { contentType });
    }

    const [fileMetadata] = await file.getMetadata();
    return {
      key,
      versionId: fileMetadata.generation?.toString(),
    };
  }

  async getDocument(key: string): Promise<Buffer> {
    const [content] = await this.storage
      .bucket(this.bucket)
      .file(key)
      .download();
    return content;
  }

  async documentExists(key: string): Promise<boolean> {
    const [exists] = await this.storage.bucket(this.bucket).file(key).exists();
    return exists;
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucket)
      .file(key)
      .getSignedUrl({
        action: "read",
        expires: Date.now() + expiresInSeconds * 1000,
      });
    return url;
  }
}
