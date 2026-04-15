import { createHash } from "node:crypto";
import { createLogger } from "@usopc/shared";
import type {
  IngestionLogEntity,
  SourceConfigEntity,
} from "../entities/index.js";
import type { IngestionSource } from "../pipeline.js";
import { ingestSource, QuotaExhaustedError } from "../pipeline.js";
import { upsertIngestionStatus } from "../db.js";
import { fetchWithRetry } from "../loaders/fetchWithRetry.js";
import { DocumentStorageService } from "./documentStorage.js";

const logger = createLogger({ service: "source-processor" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessSourceOptions {
  source: IngestionSource;
  openaiApiKey: string;
  bucketName: string;
  ingestionLogEntity: IngestionLogEntity;
  sourceConfigEntity?: SourceConfigEntity | undefined;
  /** Shared vector store instance to avoid re-creation per source in batch */
  vectorStore?: Parameters<typeof ingestSource>[1]["vectorStore"];
}

export interface ProcessSourceResult {
  status: "completed" | "failed";
  chunksCount: number;
  contentHash?: string | undefined;
  storageKey?: string | undefined;
  storageVersionId?: string | undefined;
  error?: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Fetch content as a raw Buffer (correct for both PDF and HTML/text).
 */
async function fetchContent(url: string): Promise<Buffer> {
  const res = await fetchWithRetry(
    url,
    { headers: { "User-Agent": "USOPC-Ingestion/1.0" } },
    { timeoutMs: 60_000, maxRetries: 3 },
  );
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Upload content to cloud storage. Returns key/versionId on success, undefined
 * on failure (non-fatal — ingestion proceeds without archival).
 */
async function uploadToStorage(
  bucketName: string,
  source: IngestionSource,
  content: Buffer,
  contentHash: string,
): Promise<{ storageKey?: string; storageVersionId?: string }> {
  try {
    const storage = new DocumentStorageService(bucketName);
    const expectedKey = storage.getKeyForSource(
      source.id,
      contentHash,
      source.format,
    );

    if (await storage.documentExists(expectedKey)) {
      logger.info(
        `Document already exists in storage for ${source.id}, skipping upload`,
      );
      return { storageKey: expectedKey };
    }

    const result = await storage.storeDocument(
      source.id,
      content,
      contentHash,
      source.format,
      { title: source.title, documentType: source.documentType },
    );
    return {
      storageKey: result.key,
      ...(result.versionId !== undefined
        ? { storageVersionId: result.versionId }
        : {}),
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Unknown storage error";
    logger.warn(
      `Storage upload failed for ${source.id} — ingestion will continue: ${msg}`,
    );
    return {};
  }
}

/**
 * Best-effort source config update. Swallows errors so ingestion
 * flow is never interrupted by stats bookkeeping failures.
 */
async function updateSourceConfig(
  entity: SourceConfigEntity | undefined,
  sourceId: string,
  update:
    | {
        type: "success";
        contentHash: string;
        storageKey?: string | undefined;
        storageVersionId?: string | undefined;
      }
    | { type: "failure"; error: string },
): Promise<void> {
  if (!entity) return;
  try {
    if (update.type === "success") {
      await entity.markSuccess(sourceId, update.contentHash, {
        ...(update.storageKey !== undefined
          ? { storageKey: update.storageKey }
          : {}),
        ...(update.storageVersionId !== undefined
          ? { storageVersionId: update.storageVersionId }
          : {}),
      });
    } else {
      await entity.markFailure(sourceId, update.error);
    }
  } catch (err) {
    logger.warn(
      `Failed to update source config stats for ${sourceId}: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Single code path for per-source ingestion:
 *   fetch → hash → upload → mark ingesting → ingest → update source config
 *
 * Re-throws {@link QuotaExhaustedError} so callers can handle quota
 * exhaustion at the batch level.
 */
export async function processSource(
  opts: ProcessSourceOptions,
): Promise<ProcessSourceResult> {
  const {
    source,
    openaiApiKey,
    bucketName,
    ingestionLogEntity,
    sourceConfigEntity,
    vectorStore,
  } = opts;

  // 1. Fetch content as Buffer
  let content: Buffer;
  try {
    content = await fetchContent(source.url);
  } catch (fetchError) {
    const msg =
      fetchError instanceof Error ? fetchError.message : "Unknown error";
    logger.warn(`Fetch failed for ${source.id}: ${msg}`);
    await updateSourceConfig(sourceConfigEntity, source.id, {
      type: "failure",
      error: msg,
    });
    return { status: "failed", chunksCount: 0, error: msg };
  }

  // 2. Compute content hash
  const contentHash = hashBuffer(content);

  // 3. Upload to storage (non-fatal on failure)
  const { storageKey, storageVersionId } = await uploadToStorage(
    bucketName,
    source,
    content,
    contentHash,
  );

  // 4. Mark ingesting
  await upsertIngestionStatus(
    ingestionLogEntity,
    source.id,
    source.url,
    "ingesting",
  );

  // 5. Ingest (pass content buffer to avoid double-fetch)
  const result = await ingestSource(source, {
    openaiApiKey,
    content,
    vectorStore,
    ...(storageKey !== undefined ? { storageKey } : {}),
  });

  // 6. Update source config status
  if (result.status === "completed") {
    await upsertIngestionStatus(
      ingestionLogEntity,
      source.id,
      source.url,
      "completed",
      { contentHash, chunksCount: result.chunksCount },
    );
    await updateSourceConfig(sourceConfigEntity, source.id, {
      type: "success",
      contentHash,
      storageKey,
      storageVersionId,
    });
  } else {
    await upsertIngestionStatus(
      ingestionLogEntity,
      source.id,
      source.url,
      "failed",
      result.error !== undefined ? { errorMessage: result.error } : {},
    );
    await updateSourceConfig(sourceConfigEntity, source.id, {
      type: "failure",
      error: result.error ?? "Unknown error",
    });
  }

  return {
    status: result.status,
    chunksCount: result.chunksCount,
    contentHash,
    storageKey,
    storageVersionId,
    error: result.error,
  };
}
