#!/usr/bin/env tsx
/**
 * Unified seed script — initializes the full local dev environment.
 *
 * Sequence:
 *   1. PG schema init   — runs init-db.sql + seeds source configs/sport orgs
 *   2. Document ingest   — optional, requires OPENAI_API_KEY
 *
 * Usage:
 *   pnpm seed                     # full setup (ingest if API key available)
 *   pnpm seed -- --skip-ingest    # PG only
 *   pnpm seed -- --force          # re-ingest all
 *   pnpm seed -- --dry-run        # preview changes, skip ingest
 *
 * Requires env vars (run via `pnpm seed` which uses `dotenv -e .env.local`).
 */

import { Pool } from "pg";
import { getDatabaseUrl, getSecretValue, getResource, createLogger } from "@usopc/shared";
import { createRawEmbeddings, createVectorStore } from "@usopc/core";
import { initDatabase, loadAllSources } from "./seed-db.js";
import {
  createIngestionLogEntity,
  createSourceConfigEntity,
} from "../entities/index.js";
import { processSource } from "../services/sourceProcessor.js";

const logger = createLogger({ service: "seed" });

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  skipIngest: boolean;
  force: boolean;
  dryRun: boolean;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  let skipIngest = false;
  let force = false;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--skip-ingest") {
      skipIngest = true;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { skipIngest, force, dryRun };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { skipIngest, force, dryRun } = parseArgs();
  const databaseUrl = getDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl });

  // Step 1: PG schema init
  logger.info("--- Step 1: PostgreSQL schema init ---");
  await initDatabase(pool);
  // Release the local pool immediately so its connections don't compete
  // with the shared pool used by PGVectorStore during ingestion.
  await pool.end();

  // Step 2: Document ingestion (optional)
  if (dryRun) {
    logger.info("--- Step 2: Skipping ingestion (--dry-run) ---");
  } else if (skipIngest) {
    logger.info("--- Step 2: Skipping ingestion (--skip-ingest) ---");
  } else {
    let openaiApiKey: string | undefined;
    try {
      openaiApiKey = getSecretValue("OPENAI_API_KEY");
    } catch {
      // Key not available — skip gracefully
    }

    if (!openaiApiKey) {
      logger.warn(
        "--- Step 2: Skipping ingestion (OPENAI_API_KEY not found) ---",
      );
    } else {
      logger.info("--- Step 2: Document ingestion ---");
      const sources = await loadAllSources();
      logger.info(`Loaded ${sources.length} source configuration(s)`);

      const ingestionLogEntity = createIngestionLogEntity();
      const sourceConfigEntity = createSourceConfigEntity();

      // Create a single shared vectorStore so all sources reuse the same
      // PGVectorStore instance (avoids repeated schema checks that exhaust
      // the connection pool).
      const embeddings = createRawEmbeddings(openaiApiKey);
      const vectorStore = await createVectorStore(embeddings);

      let succeeded = 0;
      let totalChunks = 0;
      const failures: { sourceId: string; error?: string | undefined }[] = [];

      for (let i = 0; i < sources.length; i++) {
        const source = sources[i]!;

        // Wait between sources for TPM window reset
        if (i > 0 && totalChunks > 0) {
          logger.info("Waiting 60s between sources for TPM window reset...");
          await sleep(60_000);
        }

        const result = await processSource({
          source,
          openaiApiKey,
          bucketName: getResource("DocumentsBucket").name,
          ingestionLogEntity,
          sourceConfigEntity,
          vectorStore,
        });

        if (result.status === "completed") {
          succeeded++;
          totalChunks += result.chunksCount;
          logger.info(`Ingested ${source.id} (${result.chunksCount} chunks)`);
        } else {
          failures.push({ sourceId: source.id, error: result.error });
        }
      }

      logger.info(
        `Ingestion: ${succeeded}/${sources.length} succeeded, ${totalChunks} total chunks`,
      );

      if (failures.length > 0) {
        logger.error("Failed sources:");
        for (const f of failures) {
          logger.error(`  - ${f.sourceId}: ${f.error}`);
        }
        process.exit(1);
      }
    }
  }

  logger.info("Seed complete.");
}

// Only run main() when executed directly (not when imported by tests)
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
