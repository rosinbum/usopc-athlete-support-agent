import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLogger, getDatabaseUrl } from "@usopc/shared";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import type { IngestionSource } from "./pipeline.js";
import { getLastContentHash, upsertIngestionStatus } from "./db.js";

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
 * Load all source configuration files from the `data/sources` directory.
 */
async function loadSourceConfigs(): Promise<IngestionSource[]> {
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
 * 1. Loads all source configs from `data/sources/`.
 * 2. For each source, fetches the content and computes a hash.
 * 3. Skips sources whose content hash has not changed since the last
 *    successful ingestion.
 * 4. Enqueues changed sources to the SQS FIFO queue for the worker to process.
 */
export async function handler(): Promise<void> {
  const databaseUrl = getDatabaseUrl();

  const pool = new Pool({ connectionString: databaseUrl });
  const sqs = new SQSClient({});

  try {
    const sources = await loadSourceConfigs();
    logger.info(`Loaded ${sources.length} source config(s)`);

    let enqueued = 0;
    let skipped = 0;

    const triggeredAt = new Date().toISOString();

    for (const source of sources) {
      try {
        // Fetch the content to compute a hash and decide whether to re-ingest
        let rawContent: string;
        try {
          const res = await fetch(source.url, {
            headers: { "User-Agent": "USOPC-Ingestion/1.0" },
          });
          rawContent = await res.text();
        } catch {
          // If we cannot fetch (e.g. network error), re-ingest to be safe
          rawContent = Date.now().toString();
        }

        const contentHash = hashContent(rawContent);
        const lastHash = await getLastContentHash(pool, source.id);

        if (contentHash === lastHash) {
          logger.info(`Skipping ${source.id} — content unchanged`);
          skipped++;
          continue;
        }

        // Mark as ingesting
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
        await upsertIngestionStatus(pool, source.id, source.url, "failed", {
          errorMessage: msg,
        });
      }
    }

    logger.info(
      `Coordinator complete: ${enqueued} enqueued, ${skipped} skipped`,
    );
  } finally {
    await pool.end();
  }
}
