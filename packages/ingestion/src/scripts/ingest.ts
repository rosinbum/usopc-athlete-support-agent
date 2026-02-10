#!/usr/bin/env tsx
/**
 * CLI script for manual document ingestion.
 *
 * Usage:
 *   pnpm --filter @usopc/ingestion ingest               # ingest ALL sources (resume by default)
 *   pnpm --filter @usopc/ingestion ingest --all          # same as above
 *   pnpm --filter @usopc/ingestion ingest --source <id>  # ingest a single source
 *   pnpm --filter @usopc/ingestion ingest --resume       # skip sources whose content hash is unchanged
 *   pnpm --filter @usopc/ingestion ingest --force        # re-ingest everything regardless of state
 *
 * Required config (via env var or SST secret):
 *   DATABASE_URL / SST Database  — PostgreSQL connection string
 *   OPENAI_API_KEY / OpenaiApiKey — OpenAI API key for embeddings
 */

import { createHash } from "node:crypto";
import { getDatabaseUrl, getSecretValue, createLogger } from "@usopc/shared";
import { ingestSource } from "../pipeline.js";
import type { IngestionSource } from "../pipeline.js";
import { loadSourceConfigs } from "../cron.js";
import { fetchWithRetry } from "../loaders/fetchWithRetry.js";

const logger = createLogger({ service: "ingestion-cli" });

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  sourceId?: string;
  all: boolean;
  resume: boolean;
  force: boolean;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  let sourceId: string | undefined;
  let all = false;
  let resume = false;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) {
      sourceId = argv[i + 1];
      i++; // skip next
    } else if (argv[i] === "--all") {
      all = true;
    } else if (argv[i] === "--resume") {
      resume = true;
    } else if (argv[i] === "--force") {
      force = true;
    }
  }

  // --force overrides --resume
  if (force) {
    resume = false;
  }

  // Default to --all + --resume when no flags are provided
  if (!sourceId && !all) {
    all = true;
  }
  if (all && !force && !resume) {
    resume = true;
  }

  return { sourceId, all, resume, force };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  const openaiApiKey = getSecretValue("OPENAI_API_KEY", "OpenaiApiKey");
  const { sourceId, all, resume, force } = parseArgs();

  // Always load from DynamoDB so ingestion stats are tracked.
  // This script runs under `sst shell` (see package.json), so SST
  // Resource bindings are always available.
  process.env.USE_DYNAMODB = "true";
  const { sources, entity } = await loadSourceConfigs();
  logger.info(`Loaded ${sources.length} source configuration(s)`);

  if (!entity) {
    logger.error(
      "DynamoDB entity unavailable. The ingest script must be run via 'sst shell' so ingestion stats are tracked. Aborting.",
    );
    process.exit(1);
  }

  if (sourceId) {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) {
      logger.error(`Source not found: ${sourceId}`);
      logger.info(
        `Available source IDs: ${sources.map((s) => s.id).join(", ")}`,
      );
      process.exit(1);
    }

    logger.info(`Ingesting single source: ${source.id} — ${source.title}`);
    const result = await ingestSource(source, { databaseUrl, openaiApiKey });

    // Update DynamoDB ingestion stats
    try {
      if (result.status === "completed") {
        const res = await fetchWithRetry(
          source.url,
          { headers: { "User-Agent": "USOPC-Ingestion/1.0" } },
          { timeoutMs: 60000, maxRetries: 3 },
        );
        const rawContent = await res.text();
        await entity.markSuccess(source.id, hashContent(rawContent));
      } else {
        await entity.markFailure(source.id, result.error ?? "Unknown error");
      }
    } catch (statsError) {
      logger.warn(
        `Failed to update DynamoDB stats for ${source.id}: ${statsError instanceof Error ? statsError.message : "Unknown error"}`,
      );
    }

    if (result.status === "completed") {
      logger.info(
        `Done: ${result.chunksCount} chunks ingested for ${result.sourceId}`,
      );
    } else {
      logger.error(`Failed: ${result.error}`);
      process.exit(1);
    }
  } else if (all) {
    logger.info(
      `Ingesting all sources (mode: ${force ? "force" : resume ? "resume" : "all"})...`,
    );

    const results: {
      sourceId: string;
      status: string;
      error?: string;
      chunksCount: number;
    }[] = [];

    for (let i = 0; i < sources.length; i++) {
      const source: IngestionSource = sources[i];

      // Resume: skip sources whose content hash hasn't changed
      if (resume) {
        try {
          const res = await fetchWithRetry(
            source.url,
            { headers: { "User-Agent": "USOPC-Ingestion/1.0" } },
            { timeoutMs: 60000, maxRetries: 3 },
          );
          const rawContent = await res.text();
          const contentHash = hashContent(rawContent);

          const config = await entity.getById(source.id);
          if (config?.lastContentHash === contentHash) {
            logger.info(`Skipping ${source.id} — content unchanged`);
            results.push({
              sourceId: source.id,
              status: "skipped",
              chunksCount: 0,
            });
            continue;
          }
        } catch (fetchError) {
          const msg =
            fetchError instanceof Error ? fetchError.message : "Unknown error";
          logger.warn(
            `Could not check hash for ${source.id}: ${msg} — will re-ingest`,
          );
        }
      }

      // Wait between sources for TPM window reset
      if (i > 0 && results[i - 1]?.status === "completed") {
        logger.info("Waiting 60s between sources for TPM window reset...");
        await sleep(60_000);
      }

      const result = await ingestSource(source, { databaseUrl, openaiApiKey });
      results.push(result);

      // Update DynamoDB ingestion stats
      try {
        if (result.status === "completed") {
          const res = await fetchWithRetry(
            source.url,
            { headers: { "User-Agent": "USOPC-Ingestion/1.0" } },
            { timeoutMs: 60000, maxRetries: 3 },
          );
          const rawContent = await res.text();
          await entity.markSuccess(source.id, hashContent(rawContent));
        } else {
          await entity.markFailure(source.id, result.error ?? "Unknown error");
        }
      } catch (statsError) {
        logger.warn(
          `Failed to update DynamoDB stats for ${source.id}: ${statsError instanceof Error ? statsError.message : "Unknown error"}`,
        );
      }
    }

    const succeeded = results.filter((r) => r.status === "completed");
    const failed = results.filter((r) => r.status === "failed");
    const skippedResults = results.filter((r) => r.status === "skipped");
    const totalChunks = results.reduce((sum, r) => sum + r.chunksCount, 0);

    logger.info(
      `Ingestion complete: ${succeeded.length} succeeded, ${failed.length} failed, ${skippedResults.length} skipped, ${totalChunks} total chunks`,
    );

    if (failed.length > 0) {
      logger.error("Failed sources:");
      for (const f of failed) {
        logger.error(`  - ${f.sourceId}: ${f.error}`);
      }
      process.exit(1);
    }
  }

  // Exit explicitly since the database connection pool keeps the process alive
  process.exit(0);
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
