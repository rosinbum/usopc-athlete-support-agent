export type { StorageService, StoreDocumentResult } from "./StorageService.js";
export { GCSStorageService } from "./GCSStorageService.js";

import { GCSStorageService } from "./GCSStorageService.js";
import type { StorageService } from "./StorageService.js";

/**
 * Create a StorageService backed by Google Cloud Storage.
 */
export function createStorageService(bucketName: string): StorageService {
  return new GCSStorageService(bucketName);
}
