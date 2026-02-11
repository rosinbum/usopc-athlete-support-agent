#!/usr/bin/env tsx
/**
 * Unified seed script — initializes the full local dev environment.
 *
 * Sequence:
 *   1. PG schema init   — runs init-db.sql
 *   2. DynamoDB seed     — seeds source configs + sport organizations
 *   3. Document ingest   — optional, requires OPENAI_API_KEY
 *
 * Usage:
 *   pnpm seed                     # full setup (ingest if API key available)
 *   pnpm seed -- --skip-ingest    # PG + DynamoDB only
 *   pnpm seed -- --force          # overwrite DynamoDB + re-ingest all
 *   pnpm seed -- --dry-run        # preview DynamoDB changes, skip ingest
 *
 * Requires SST context (run via `pnpm seed` which uses `sst shell`).
 */

import { Pool } from "pg";
import { getDatabaseUrl, getSecretValue, createLogger } from "@usopc/shared";
import { initDatabase, loadAllSources, repoRoot } from "./seed-db.js";
import {
  seedSourceConfigs,
  seedSportOrgs,
  type CliOptions,
} from "./seed-dynamodb.js";
import { ingestAll } from "../pipeline.js";

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
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { skipIngest, force, dryRun } = parseArgs();
  const databaseUrl = getDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Step 1: PG schema init
    logger.info("--- Step 1: PostgreSQL schema init ---");
    await initDatabase(pool);

    // Step 2: DynamoDB seed
    logger.info("--- Step 2: DynamoDB seed ---");
    const dynamoOptions: CliOptions = { dryRun, force };
    await seedSourceConfigs(dynamoOptions);
    await seedSportOrgs(dynamoOptions);

    // Step 3: Document ingestion (optional)
    if (dryRun) {
      logger.info("--- Step 3: Skipping ingestion (--dry-run) ---");
    } else if (skipIngest) {
      logger.info("--- Step 3: Skipping ingestion (--skip-ingest) ---");
    } else {
      let openaiApiKey: string | undefined;
      try {
        openaiApiKey = getSecretValue("OPENAI_API_KEY", "OpenaiApiKey");
      } catch {
        // Key not available — skip gracefully
      }

      if (!openaiApiKey) {
        logger.warn(
          "--- Step 3: Skipping ingestion (OPENAI_API_KEY not found) ---",
        );
      } else {
        logger.info("--- Step 3: Document ingestion ---");
        const sources = await loadAllSources();
        logger.info(`Loaded ${sources.length} source configuration(s)`);

        const results = await ingestAll(sources, {
          databaseUrl,
          openaiApiKey,
        });

        const succeeded = results.filter((r) => r.status === "completed");
        const failed = results.filter((r) => r.status === "failed");
        const totalChunks = results.reduce((sum, r) => sum + r.chunksCount, 0);

        logger.info(
          `Ingestion: ${succeeded.length}/${results.length} succeeded, ${totalChunks} total chunks`,
        );

        if (failed.length > 0) {
          logger.error("Failed sources:");
          for (const f of failed) {
            logger.error(`  - ${f.sourceId}: ${f.error}`);
          }
          process.exit(1);
        }
      }
    }

    logger.info("Seed complete.");
  } finally {
    await pool.end();
  }
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
