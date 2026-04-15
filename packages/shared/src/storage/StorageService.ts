export interface StoreDocumentResult {
  key: string;
  versionId?: string | undefined;
}

export interface StorageService {
  storeDocument(
    key: string,
    content: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<StoreDocumentResult>;

  getDocument(key: string): Promise<Buffer>;

  documentExists(key: string): Promise<boolean>;

  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
