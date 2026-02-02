import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLogger, getDatabaseUrl, getRequiredEnv } from "@usopc/shared";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { ingestSource } from "./pipeline.js";
import type { IngestionSource } from "./pipeline.js";

const logger = createLogger({ service: "ingestion-cron" });

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
// Ingestion status helpers
// ---------------------------------------------------------------------------

async function getLastContentHash(
  pool: Pool,
  sourceId: string,
): Promise<string | null> {
  const result = await pool.query(
    `SELECT content_hash FROM ingestion_status
     WHERE source_id = $1 AND status = 'completed'
     ORDER BY completed_at DESC LIMIT 1`,
    [sourceId],
  );
  return result.rows[0]?.content_hash ?? null;
}

async function upsertIngestionStatus(
  pool: Pool,
  sourceId: string,
  sourceUrl: string,
  status: string,
  fields: {
    contentHash?: string;
    chunksCount?: number;
    errorMessage?: string;
  } = {},
): Promise<void> {
  if (status === "ingesting") {
    await pool.query(
      `INSERT INTO ingestion_status (source_id, source_url, status, started_at)
       VALUES ($1, $2, $3, NOW())`,
      [sourceId, sourceUrl, status],
    );
  } else if (status === "completed") {
    await pool.query(
      `UPDATE ingestion_status
       SET status = $1, content_hash = $2, chunks_count = $3, completed_at = NOW()
       WHERE source_id = $4 AND status = 'ingesting'
       ORDER BY started_at DESC LIMIT 1`,
      [status, fields.contentHash, fields.chunksCount, sourceId],
    );
  } else if (status === "failed") {
    await pool.query(
      `UPDATE ingestion_status
       SET status = $1, error_message = $2, completed_at = NOW()
       WHERE source_id = $3 AND status = 'ingesting'
       ORDER BY started_at DESC LIMIT 1`,
      [status, fields.errorMessage, sourceId],
    );
  }
}

// ---------------------------------------------------------------------------
// Lambda / cron handler
// ---------------------------------------------------------------------------

/**
 * EventBridge-triggered Lambda handler for weekly (or ad-hoc) ingestion.
 *
 * 1. Loads all source configs from `data/sources/`.
 * 2. For each source, fetches the content and computes a hash.
 * 3. Skips sources whose content hash has not changed since the last
 *    successful ingestion.
 * 4. Ingests changed sources and updates the `ingestion_status` table.
 */
export async function handler(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  const openaiApiKey = getRequiredEnv("OPENAI_API_KEY");

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const sources = await loadSourceConfigs();
    logger.info(`Loaded ${sources.length} source config(s)`);

    let ingested = 0;
    let skipped = 0;
    let failed = 0;

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

        const result = await ingestSource(source, {
          databaseUrl,
          openaiApiKey,
        });

        if (result.status === "completed") {
          await upsertIngestionStatus(
            pool,
            source.id,
            source.url,
            "completed",
            {
              contentHash,
              chunksCount: result.chunksCount,
            },
          );
          ingested++;
        } else {
          await upsertIngestionStatus(pool, source.id, source.url, "failed", {
            errorMessage: result.error,
          });
          failed++;
        }
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Cron ingestion error for ${source.id}: ${msg}`);
        await upsertIngestionStatus(pool, source.id, source.url, "failed", {
          errorMessage: msg,
        });
        failed++;
      }
    }

    logger.info(
      `Cron ingestion complete: ${ingested} ingested, ${skipped} skipped, ${failed} failed`,
    );
  } finally {
    await pool.end();
  }
}
