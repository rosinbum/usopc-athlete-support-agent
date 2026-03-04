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
  s3Key?: string | undefined;
  s3VersionId?: string | undefined;
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
 * Upload content to S3. Returns key/versionId on success, undefined on
 * failure (non-fatal — ingestion proceeds without S3 archival).
 */
async function uploadToS3(
  bucketName: string,
  source: IngestionSource,
  content: Buffer,
  contentHash: string,
): Promise<{ s3Key?: string; s3VersionId?: string }> {
  try {
    const storage = new DocumentStorageService(bucketName);
    const expectedKey = storage.getKeyForSource(
      source.id,
      contentHash,
      source.format,
    );

    if (await storage.documentExists(expectedKey)) {
      logger.info(
        `S3 document already exists for ${source.id}, skipping upload`,
      );
      return { s3Key: expectedKey };
    }

    const result = await storage.storeDocument(
      source.id,
      content,
      contentHash,
      source.format,
      { title: source.title, documentType: source.documentType },
    );
    return {
      s3Key: result.key,
      ...(result.versionId !== undefined
        ? { s3VersionId: result.versionId }
        : {}),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown S3 error";
    logger.warn(
      `S3 upload failed for ${source.id} — ingestion will continue: ${msg}`,
    );
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Single code path for per-source ingestion:
 *   fetch → hash → S3 → mark ingesting → ingest → update DynamoDB
 *
 * Re-throws {@link QuotaExhaustedError} so callers (e.g. the SQS worker)
 * can handle quota exhaustion at the batch level.
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

    if (sourceConfigEntity) {
      try {
        await sourceConfigEntity.markFailure(source.id, msg);
      } catch {
        /* best-effort */
      }
    }

    return { status: "failed", chunksCount: 0, error: msg };
  }

  // 2. Compute content hash
  const contentHash = hashBuffer(content);

  // 3. Upload to S3 (non-fatal on failure)
  const { s3Key, s3VersionId } = await uploadToS3(
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
    ...(s3Key !== undefined ? { s3Key } : {}),
  });

  // 6. Update DynamoDB status
  if (result.status === "completed") {
    await upsertIngestionStatus(
      ingestionLogEntity,
      source.id,
      source.url,
      "completed",
      { contentHash, chunksCount: result.chunksCount },
    );

    if (sourceConfigEntity) {
      try {
        await sourceConfigEntity.markSuccess(source.id, contentHash, {
          ...(s3Key !== undefined ? { s3Key } : {}),
          ...(s3VersionId !== undefined ? { s3VersionId } : {}),
        });
      } catch (statsError) {
        logger.warn(
          `Failed to update DynamoDB stats for ${source.id}: ${statsError instanceof Error ? statsError.message : "Unknown error"}`,
        );
      }
    }
  } else {
    await upsertIngestionStatus(
      ingestionLogEntity,
      source.id,
      source.url,
      "failed",
      result.error !== undefined ? { errorMessage: result.error } : {},
    );

    if (sourceConfigEntity) {
      try {
        await sourceConfigEntity.markFailure(
          source.id,
          result.error ?? "Unknown error",
        );
      } catch (statsError) {
        logger.warn(
          `Failed to update DynamoDB stats for ${source.id}: ${statsError instanceof Error ? statsError.message : "Unknown error"}`,
        );
      }
    }
  }

  return {
    status: result.status,
    chunksCount: result.chunksCount,
    contentHash,
    s3Key,
    s3VersionId,
    error: result.error,
  };
}
