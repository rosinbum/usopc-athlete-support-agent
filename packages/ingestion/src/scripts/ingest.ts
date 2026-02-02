#!/usr/bin/env tsx
/**
 * CLI script for manual document ingestion.
 *
 * Usage:
 *   pnpm --filter @usopc/ingestion ingest               # ingest ALL sources
 *   pnpm --filter @usopc/ingestion ingest --all          # same as above
 *   pnpm --filter @usopc/ingestion ingest --source <id>  # ingest a single source
 *
 * Environment variables:
 *   DATABASE_URL   — PostgreSQL connection string (required)
 *   OPENAI_API_KEY — OpenAI API key for embeddings (required)
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getDatabaseUrl, getRequiredEnv, createLogger } from "@usopc/shared";
import { ingestSource, ingestAll } from "../pipeline.js";
import type { IngestionSource } from "../pipeline.js";

const logger = createLogger({ service: "ingestion-cli" });

// ---------------------------------------------------------------------------
// Source loading (mirrors cron.ts but isolated for the CLI)
// ---------------------------------------------------------------------------

interface SourceFile {
  ngbId?: string;
  sources: Array<Omit<IngestionSource, "ngbId">>;
}

function sourcesDir(): string {
  return (
    process.env.SOURCES_DIR ??
    resolve(import.meta.dirname ?? __dirname, "../../../../../data/sources")
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

function parseArgs(): { sourceId?: string; all: boolean } {
  const args = process.argv.slice(2);
  let sourceId: string | undefined;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) {
      sourceId = args[i + 1];
      i++; // skip next
    } else if (args[i] === "--all") {
      all = true;
    }
  }

  // Default to --all when no flags are provided
  if (!sourceId && !all) {
    all = true;
  }

  return { sourceId, all };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  const openaiApiKey = getRequiredEnv("OPENAI_API_KEY");
  const { sourceId, all } = parseArgs();

  const sources = await loadAllSources();
  logger.info(`Loaded ${sources.length} source configuration(s)`);

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

    if (result.status === "completed") {
      logger.info(
        `Done: ${result.chunksCount} chunks ingested for ${result.sourceId}`,
      );
    } else {
      logger.error(`Failed: ${result.error}`);
      process.exit(1);
    }
  } else if (all) {
    logger.info("Ingesting all sources...");
    const results = await ingestAll(sources, { databaseUrl, openaiApiKey });

    const succeeded = results.filter((r) => r.status === "completed");
    const failed = results.filter((r) => r.status === "failed");
    const totalChunks = results.reduce((sum, r) => sum + r.chunksCount, 0);

    logger.info(
      `Ingestion complete: ${succeeded.length}/${results.length} succeeded, ${totalChunks} total chunks`,
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

main().catch((error) => {
  logger.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
