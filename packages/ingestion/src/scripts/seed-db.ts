#!/usr/bin/env tsx
/**
 * Database seed script.
 *
 * Usage:
 *   pnpm --filter @usopc/ingestion seed             # create tables + ingest all
 *   pnpm --filter @usopc/ingestion seed --init-only  # only create tables
 *   pnpm --filter @usopc/ingestion seed --clear      # drop existing chunks, then re-ingest
 *
 * Environment variables:
 *   DATABASE_URL   — PostgreSQL connection string (required)
 *   OPENAI_API_KEY — OpenAI API key for embeddings (required unless --init-only)
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { getDatabaseUrl, getRequiredEnv, createLogger } from "@usopc/shared";
import { ingestAll } from "../pipeline.js";
import type { IngestionSource } from "../pipeline.js";

const logger = createLogger({ service: "seed-db" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function repoRoot(): string {
  return resolve(
    import.meta.dirname ?? __dirname,
    "../../../../..",
  );
}

/**
 * Execute the `init-db.sql` migration to create all tables and indexes.
 */
async function initDatabase(pool: Pool): Promise<void> {
  const sqlPath = join(repoRoot(), "scripts", "init-db.sql");
  const sql = await readFile(sqlPath, "utf-8");
  await pool.query(sql);
  logger.info("Database schema initialized (init-db.sql executed)");
}

/**
 * Remove all rows from `document_chunks` and `ingestion_status`.
 */
async function clearDocuments(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM document_chunks");
  await pool.query("DELETE FROM ingestion_status");
  logger.info("Cleared document_chunks and ingestion_status tables");
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

interface SourceFile {
  ngbId?: string;
  sources: Array<Omit<IngestionSource, "ngbId">>;
}

function sourcesDir(): string {
  return (
    process.env.SOURCES_DIR ??
    join(repoRoot(), "data", "sources")
  );
}

async function loadAllSources(): Promise<IngestionSource[]> {
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
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { initOnly: boolean; clear: boolean } {
  const args = process.argv.slice(2);
  return {
    initOnly: args.includes("--init-only"),
    clear: args.includes("--clear"),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  const { initOnly, clear } = parseArgs();

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Always run the schema migration
    await initDatabase(pool);

    if (initOnly) {
      logger.info("--init-only flag set; skipping ingestion.");
      return;
    }

    if (clear) {
      await clearDocuments(pool);
    }

    const openaiApiKey = getRequiredEnv("OPENAI_API_KEY");
    const sources = await loadAllSources();
    logger.info(`Loaded ${sources.length} source configuration(s)`);

    const results = await ingestAll(sources, { databaseUrl, openaiApiKey });

    const succeeded = results.filter((r) => r.status === "completed");
    const failed = results.filter((r) => r.status === "failed");
    const totalChunks = results.reduce((sum, r) => sum + r.chunksCount, 0);

    logger.info(
      `Seed complete: ${succeeded.length}/${results.length} sources succeeded, ${totalChunks} total chunks`,
    );

    if (failed.length > 0) {
      logger.error("Failed sources:");
      for (const f of failed) {
        logger.error(`  - ${f.sourceId}: ${f.error}`);
      }
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  logger.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
