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
import { getDatabaseUrl, getSecretValue, createLogger } from "@usopc/shared";
import { ingestAll } from "../pipeline.js";
import type { IngestionSource } from "../pipeline.js";

const logger = createLogger({ service: "seed-db" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function repoRoot(): string {
  return resolve(import.meta.dirname ?? __dirname, "../../../..");
}

/**
 * Execute the `init-db.sql` migration to create all tables and indexes.
 */
export async function initDatabase(pool: Pool): Promise<void> {
  const sqlPath = join(repoRoot(), "scripts", "init-db.sql");
  const sql = await readFile(sqlPath, "utf-8");
  await pool.query(sql);
  logger.info("Database schema initialized (init-db.sql executed)");
}

/**
 * Remove all rows from `document_chunks`.
 */
async function clearDocuments(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM document_chunks");
  logger.info("Cleared document_chunks table");
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

interface SourceFile {
  ngbId?: string;
  sources: Array<Omit<IngestionSource, "ngbId">>;
}

function sourcesDir(): string {
  return process.env.SOURCES_DIR ?? join(repoRoot(), "data", "sources");
}

export async function loadAllSources(): Promise<IngestionSource[]> {
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

    const openaiApiKey = getSecretValue("OPENAI_API_KEY", "OpenaiApiKey");

    if (clear) {
      await clearDocuments(pool);
    }
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

// Only run main() when executed directly (not when imported by tests or orchestrator)
const isDirectExecution =
  typeof process.env.VITEST === "undefined" &&
  typeof process.env.NODE_TEST === "undefined";

if (isDirectExecution) {
  main().catch((error) => {
    logger.error(
      `Fatal error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
