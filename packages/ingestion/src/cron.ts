import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLogger, getDatabaseUrl, isProduction } from "@usopc/shared";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import type { IngestionSource } from "./pipeline.js";
import { getLastContentHash, upsertIngestionStatus } from "./db.js";
import {
  createSourceConfigEntity,
  type SourceConfig,
} from "./entities/index.js";
import { fetchWithRetry } from "./loaders/fetchWithRetry.js";

const logger = createLogger({ service: "ingestion-cron" });

// ---------------------------------------------------------------------------
// Shared types (used by both coordinator and worker)
// ---------------------------------------------------------------------------

export interface IngestionMessage {
  source: IngestionSource;
  contentHash: string;
  triggeredAt: string;
}

// ---------------------------------------------------------------------------
// Source config loading
// ---------------------------------------------------------------------------

interface SourceFile {
  ngbId?: string;
  sources: Array<Omit<IngestionSource, "ngbId">>;
}

/**
 * Resolve the absolute path to the `data/sources` directory at the repo root.
 */
function sourcesDir(): string {
  // In production the SOURCES_DIR env var may be set; fall back to the repo
  // layout during local development.
  return (
    process.env.SOURCES_DIR ??
    resolve(import.meta.dirname ?? __dirname, "../../../../data/sources")
  );
}

/**
 * Load source configurations from JSON files (local/dev fallback).
 */
async function loadSourceConfigsFromJson(): Promise<IngestionSource[]> {
  const dir = sourcesDir();
  const files = await readdir(dir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const allSources: IngestionSource[] = [];

  for (const file of jsonFiles) {
    const raw = await readFile(join(dir, file), "utf-8");
    const parsed: SourceFile = JSON.parse(raw);
    const ngbId = parsed.ngbId ?? null;

    for (const src of parsed.sources) {
      allSources.push({
        ...src,
        ngbId,
        format: src.format ?? ("pdf" as const),
        priority: src.priority ?? ("medium" as const),
      } as IngestionSource);
    }
  }

  return allSources;
}

/**
 * Convert a DynamoDB SourceConfig to an IngestionSource for pipeline compatibility.
 */
function toIngestionSource(config: SourceConfig): IngestionSource {
  return {
    id: config.id,
    title: config.title,
    documentType: config.documentType,
    topicDomains: config.topicDomains,
    url: config.url,
    format: config.format,
    ngbId: config.ngbId,
    priority: config.priority,
    description: config.description,
    authorityLevel: config.authorityLevel,
  };
}

/**
 * Load source configurations from DynamoDB (production).
 */
async function loadSourceConfigsFromDynamoDB(): Promise<{
  sources: IngestionSource[];
  entity: ReturnType<typeof createSourceConfigEntity>;
}> {
  const entity = createSourceConfigEntity();
  const configs = await entity.getAllEnabled();
  const sources = configs.map(toIngestionSource);
  return { sources, entity };
}

const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Load all source configurations.
 * In production, loads from DynamoDB. Otherwise falls back to JSON files.
 */
export async function loadSourceConfigs(): Promise<{
  sources: IngestionSource[];
  entity?: ReturnType<typeof createSourceConfigEntity>;
}> {
  // Check for explicit flag to force DynamoDB even in dev
  const useDynamoDB = isProduction() || process.env.USE_DYNAMODB === "true";

  if (useDynamoDB) {
    logger.info("Loading source configs from DynamoDB");
    return loadSourceConfigsFromDynamoDB();
  }

  logger.info("Loading source configs from JSON files");
  return { sources: await loadSourceConfigsFromJson() };
}

// ---------------------------------------------------------------------------
// Content hashing
// ---------------------------------------------------------------------------

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// Coordinator Lambda handler
// ---------------------------------------------------------------------------

/**
 * EventBridge-triggered coordinator Lambda.
 *
 * 1. Loads all source configs (from DynamoDB in production, JSON files in dev).
 * 2. For each source, fetches the content (with retry) and computes a hash.
 * 3. Skips sources whose content hash has not changed since the last
 *    successful ingestion.
 * 4. Enqueues changed sources to the SQS FIFO queue for the worker to process.
 */
export async function handler(): Promise<void> {
  const databaseUrl = getDatabaseUrl();

  const pool = new Pool({ connectionString: databaseUrl });
  const sqs = new SQSClient({});

  try {
    const { sources, entity } = await loadSourceConfigs();
    logger.info(`Loaded ${sources.length} source config(s)`);

    let enqueued = 0;
    let skipped = 0;
    let failed = 0;

    const triggeredAt = new Date().toISOString();

    for (const source of sources) {
      try {
        // Skip sources with too many consecutive failures
        if (entity) {
          const config = await entity.getById(source.id);
          if (
            config &&
            config.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
          ) {
            logger.warn(
              `Skipping ${source.id} — ${config.consecutiveFailures} consecutive failures (reset via sources-cli)`,
            );
            skipped++;
            continue;
          }
        }

        // Fetch the content to compute a hash and decide whether to re-ingest
        // Using fetchWithRetry for resilience
        let rawContent: string;
        try {
          const res = await fetchWithRetry(
            source.url,
            {
              headers: { "User-Agent": "USOPC-Ingestion/1.0" },
            },
            {
              timeoutMs: 60000,
              maxRetries: 3,
            },
          );
          rawContent = await res.text();
        } catch (fetchError) {
          // Log the fetch error but mark for re-ingestion
          const fetchMsg =
            fetchError instanceof Error ? fetchError.message : "Unknown error";
          logger.warn(`Fetch failed for ${source.id}: ${fetchMsg}`);

          // Mark failure in DynamoDB if available
          if (entity) {
            await entity.markFailure(source.id, fetchMsg);
          }

          // Use timestamp to force re-ingestion attempt
          rawContent = Date.now().toString();
          failed++;
          continue;
        }

        const contentHash = hashContent(rawContent);

        // Get last hash from DynamoDB entity if available, otherwise from Postgres
        let lastHash: string | null;
        if (entity) {
          const config = await entity.getById(source.id);
          lastHash = config?.lastContentHash ?? null;
        } else {
          lastHash = await getLastContentHash(pool, source.id);
        }

        if (contentHash === lastHash) {
          logger.info(`Skipping ${source.id} — content unchanged`);
          skipped++;
          continue;
        }

        // Mark as ingesting in Postgres (for backward compatibility)
        await upsertIngestionStatus(pool, source.id, source.url, "ingesting");

        // Enqueue for the worker
        const message: IngestionMessage = {
          source,
          contentHash,
          triggeredAt,
        };

        await sqs.send(
          new SendMessageCommand({
            QueueUrl: Resource.IngestionQueue.url,
            MessageBody: JSON.stringify(message),
            MessageGroupId: "ingestion",
          }),
        );

        logger.info(`Enqueued ${source.id} for ingestion`);
        enqueued++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Coordinator error for ${source.id}: ${msg}`);

        // Mark failure in both systems
        await upsertIngestionStatus(pool, source.id, source.url, "failed", {
          errorMessage: msg,
        });
        if (entity) {
          await entity.markFailure(source.id, msg);
        }
        failed++;
      }
    }

    logger.info(
      `Coordinator complete: ${enqueued} enqueued, ${skipped} skipped, ${failed} failed`,
    );

    // Systematic failure alerting
    const totalProcessed = enqueued + failed;
    if (failed > 0 && enqueued === 0) {
      logger.error(
        `ALERT: All ${failed} processed source(s) failed — no sources were enqueued`,
      );
    } else if (totalProcessed > 0 && failed > totalProcessed * 0.5) {
      logger.warn(
        `ALERT: Majority of sources failed (${failed}/${totalProcessed})`,
      );
    }
  } finally {
    await pool.end();
  }
}
