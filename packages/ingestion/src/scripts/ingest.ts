#!/usr/bin/env tsx
/**
 * CLI script for manual document ingestion.
 *
 * Usage:
 *   pnpm --filter @usopc/ingestion ingest               # ingest only NEW (never-ingested) sources
 *   pnpm --filter @usopc/ingestion ingest --all          # same as above
 *   pnpm --filter @usopc/ingestion ingest --source <id>  # ingest a single source (always runs)
 *   pnpm --filter @usopc/ingestion ingest --resume       # re-ingest sources whose content hash changed
 *   pnpm --filter @usopc/ingestion ingest --force        # re-ingest everything regardless of state
 *
 * Required config (via env var or SST secret):
 *   DATABASE_URL / SST Database  — PostgreSQL connection string
 *   OPENAI_API_KEY / OpenaiApiKey — OpenAI API key for embeddings
 */

import { createHash } from "node:crypto";
import {
  getDatabaseUrl,
  getSecretValue,
  createLogger,
  type SourceConfig,
} from "@usopc/shared";
import { ingestSource } from "../pipeline.js";
import type { IngestionSource } from "../pipeline.js";
import { createSourceConfigEntity } from "../entities/index.js";
import { toIngestionSource } from "../cron.js";
import {
  fetchWithRetry,
  FetchWithRetryError,
} from "../loaders/fetchWithRetry.js";

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

  // Default to --all when no flags are provided (new-only behavior)
  if (!sourceId && !all) {
    all = true;
  }

  // Default to resume when running --all without explicit --force
  if (all && !force && !resume) {
    resume = true;
  }

  return { sourceId, all, resume, force };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPermanentHttpError(error: unknown): boolean {
  return (
    error instanceof FetchWithRetryError &&
    error.statusCode !== undefined &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  );
}

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

  // Load directly from DynamoDB so ingestion stats are always tracked.
  // This script runs under `sst shell` (see package.json), so SST
  // Resource bindings are always available.
  const entity = createSourceConfigEntity();
  const configs = await entity.getAllEnabled();
  const sources: IngestionSource[] = configs.map(toIngestionSource);
  logger.info(`Loaded ${sources.length} source configuration(s) from DynamoDB`);

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
    const mode = force ? "force" : resume ? "resume" : "new-only";
    logger.info(`Ingesting all sources (mode: ${mode})...`);

    const results: {
      sourceId: string;
      status: string;
      error?: string;
      chunksCount: number;
    }[] = [];

    for (let i = 0; i < sources.length; i++) {
      const source: IngestionSource = sources[i];

      if (!force) {
        const config = await entity.getById(source.id);

        if (resume) {
          // Resume: skip sources whose content hash hasn't changed
          try {
            const res = await fetchWithRetry(
              source.url,
              { headers: { "User-Agent": "USOPC-Ingestion/1.0" } },
              { timeoutMs: 60000, maxRetries: 3 },
            );
            const rawContent = await res.text();
            const contentHash = hashContent(rawContent);

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
              fetchError instanceof Error
                ? fetchError.message
                : "Unknown error";

            if (isPermanentHttpError(fetchError)) {
              logger.warn(`Skipping ${source.id}: ${msg}`);
              results.push({
                sourceId: source.id,
                status: "failed",
                error: msg,
                chunksCount: 0,
              });
              try {
                await entity.markFailure(source.id, msg);
              } catch {
                /* already logged */
              }
              continue;
            }

            // Transient errors (network, 5xx) — proceed with re-ingestion attempt
            logger.warn(
              `Could not check hash for ${source.id}: ${msg} — will re-ingest`,
            );
          }
        } else {
          // Default (new-only): skip sources that have already been ingested
          if (config?.lastIngestedAt) {
            logger.info(
              `Skipping ${source.id} — already ingested (use --resume or --force to re-ingest)`,
            );
            results.push({
              sourceId: source.id,
              status: "skipped",
              chunksCount: 0,
            });
            continue;
          }
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
      logger.warn("Failed sources:");
      for (const f of failed) {
        logger.warn(`  - ${f.sourceId}: ${f.error}`);
      }
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
