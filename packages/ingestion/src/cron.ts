import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLogger, isProduction, type AuthorityLevel } from "@usopc/shared";
import { createHash } from "node:crypto";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import type { IngestionSource } from "./pipeline.js";
import { getLastContentHash, upsertIngestionStatus } from "./db.js";
import {
  createSourceConfigEntity,
  createIngestionLogEntity,
  createDiscoveredSourceEntity,
  type SourceConfig,
  type DiscoveredSource,
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
export function toIngestionSource(config: SourceConfig): IngestionSource {
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
// Approved discoveries processing
// ---------------------------------------------------------------------------

/**
 * Process approved discoveries and create SourceConfigs for them.
 * Links the DiscoveredSource.sourceConfigId after creation.
 *
 * @param sourceConfigEntity - The SourceConfigEntity instance
 * @param lastRunTime - Timestamp of last cron run (ISO string)
 * @returns Number of SourceConfigs created
 */
export async function processApprovedDiscoveries(
  sourceConfigEntity: ReturnType<typeof createSourceConfigEntity>,
  lastRunTime: string,
): Promise<number> {
  const discoveredSourceEntity = createDiscoveredSourceEntity();

  try {
    // Fetch newly approved discoveries since last run
    const approvedSources =
      await discoveredSourceEntity.getApprovedSince(lastRunTime);

    logger.info(
      `Found ${approvedSources.length} approved discoveries since ${lastRunTime}`,
    );

    let created = 0;

    for (const discovery of approvedSources) {
      // Skip if already has a SourceConfig
      if (discovery.sourceConfigId) {
        logger.debug(`Discovery ${discovery.id} already has SourceConfig`);
        continue;
      }

      try {
        // Create SourceConfig from discovery metadata
        const sourceConfig = await sourceConfigEntity.create({
          id: discovery.id,
          title: discovery.title,
          documentType: discovery.documentType ?? "Unknown",
          topicDomains: discovery.topicDomains,
          url: discovery.url,
          format: discovery.format ?? "html",
          ngbId: discovery.ngbId ?? null,
          priority: discovery.priority ?? "medium",
          description: discovery.description ?? "",
          authorityLevel:
            (discovery.authorityLevel as AuthorityLevel) ??
            "educational_guidance",
        });

        // Link DiscoveredSource to SourceConfig
        await discoveredSourceEntity.linkToSourceConfig(
          discovery.id,
          sourceConfig.id,
        );

        logger.info(`Created SourceConfig for discovery: ${discovery.id}`, {
          discoveryId: discovery.id,
          sourceConfigId: sourceConfig.id,
          url: discovery.url,
        });

        created++;
      } catch (error) {
        logger.error(
          `Failed to create SourceConfig for discovery: ${discovery.id}`,
          {
            discoveryId: discovery.id,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        // Continue processing other discoveries
      }
    }

    logger.info(`Created ${created} SourceConfigs from approved discoveries`);
    return created;
  } catch (error) {
    logger.error("Error processing approved discoveries", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Coordinator Lambda handler
// ---------------------------------------------------------------------------

/**
 * EventBridge-triggered coordinator Lambda.
 *
 * 1. Processes newly approved discoveries and creates SourceConfigs (production only).
 * 2. Loads all enabled source configs (from DynamoDB in production, JSON files in dev).
 * 3. Skips sources that have already been ingested (only new sources are processed).
 * 4. For each new source, fetches the content (with retry) and computes a hash.
 * 5. Enqueues new sources to the SQS FIFO queue for the worker to process.
 *
 * To re-ingest existing sources, use the admin UI (single or bulk) or the
 * CLI with --resume (content-change detection) or --force (unconditional).
 */
export async function handler(): Promise<void> {
  const sqs = new SQSClient({});
  const ingestionLogEntity = createIngestionLogEntity();

  try {
    // Step 1: Process approved discoveries (production only)
    if (isProduction()) {
      const sourceConfigEntity = createSourceConfigEntity();
      // Look back 14 days (deliberately overlapping the 7-day cron schedule)
      // to tolerate scheduler drift. Idempotent — sourceConfigId check in
      // processApprovedDiscoveries skips already-converted discoveries.
      const lastRunTime = new Date(
        Date.now() - 14 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const createdCount = await processApprovedDiscoveries(
        sourceConfigEntity,
        lastRunTime,
      );
      logger.info(
        `Processed approved discoveries: ${createdCount} SourceConfigs created`,
      );
    }

    // Step 2: Load source configs
    const { sources, entity } = await loadSourceConfigs();
    logger.info(`Loaded ${sources.length} source config(s)`);

    let enqueued = 0;
    let skipped = 0;
    let failed = 0;

    const triggeredAt = new Date().toISOString();

    for (const source of sources) {
      try {
        // -----------------------------------------------------------------
        // Default: only ingest NEW (never-ingested) sources.
        // Re-ingestion of existing sources requires an explicit trigger
        // via the admin UI or CLI (--resume / --force).
        // -----------------------------------------------------------------
        if (entity) {
          const config = await entity.getById(source.id);

          // Skip sources with too many consecutive failures
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

          // Skip sources that have already been successfully ingested
          if (config?.lastIngestedAt) {
            logger.info(`Skipping ${source.id} — already ingested`);
            skipped++;
            continue;
          }
        } else {
          // JSON dev fallback: check DynamoDB for prior ingestion
          const lastHash = await getLastContentHash(
            ingestionLogEntity,
            source.id,
          );
          if (lastHash) {
            logger.info(`Skipping ${source.id} — already ingested`);
            skipped++;
            continue;
          }
        }

        // Fetch the content to compute a hash for the worker
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
          const fetchMsg =
            fetchError instanceof Error ? fetchError.message : "Unknown error";
          logger.warn(`Fetch failed for ${source.id}: ${fetchMsg}`);

          // Mark failure in DynamoDB if available
          if (entity) {
            await entity.markFailure(source.id, fetchMsg);
          }

          failed++;
          continue;
        }

        const contentHash = hashContent(rawContent);

        // Mark as ingesting in DynamoDB
        await upsertIngestionStatus(
          ingestionLogEntity,
          source.id,
          source.url,
          "ingesting",
        );

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

        // Mark failure in DynamoDB
        await upsertIngestionStatus(
          ingestionLogEntity,
          source.id,
          source.url,
          "failed",
          {
            errorMessage: msg,
          },
        );
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
    // No pool cleanup needed — DynamoDB client handles its own connections
  }
}
