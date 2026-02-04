#!/usr/bin/env tsx
/**
 * Migrate source configurations from JSON files to DynamoDB.
 *
 * Usage:
 *   pnpm seed:dynamodb              # Migrate JSON → DynamoDB
 *   pnpm seed:dynamodb --dry-run    # Preview only (no writes)
 *   pnpm seed:dynamodb --force      # Overwrite existing items
 *
 * Environment variables:
 *   SOURCE_CONFIG_TABLE_NAME — DynamoDB table name (or use SST Resource)
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLogger, type AuthorityLevel } from "@usopc/shared";
import {
  createSourceConfigEntity,
  type CreateSourceInput,
} from "../entities/index.js";

const logger = createLogger({ service: "seed-dynamodb" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceFile {
  ngbId?: string;
  sources: Array<{
    id: string;
    title: string;
    documentType: string;
    topicDomains: string[];
    url: string;
    format?: "pdf" | "html" | "text";
    priority?: "high" | "medium" | "low";
    description: string;
    authorityLevel?: AuthorityLevel;
  }>;
}

// ---------------------------------------------------------------------------
// Source loading from JSON
// ---------------------------------------------------------------------------

function sourcesDir(): string {
  return (
    process.env.SOURCES_DIR ??
    resolve(import.meta.dirname ?? __dirname, "../../../../data/sources")
  );
}

async function loadSourcesFromJson(): Promise<CreateSourceInput[]> {
  const dir = sourcesDir();
  const files = await readdir(dir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const allSources: CreateSourceInput[] = [];

  for (const file of jsonFiles) {
    const raw = await readFile(join(dir, file), "utf-8");
    const parsed: SourceFile = JSON.parse(raw);
    const ngbId = parsed.ngbId ?? null;

    for (const src of parsed.sources) {
      allSources.push({
        id: src.id,
        title: src.title,
        documentType: src.documentType,
        topicDomains: src.topicDomains,
        url: src.url,
        format: src.format ?? "pdf",
        ngbId,
        priority: src.priority ?? "medium",
        description: src.description,
        authorityLevel: src.authorityLevel ?? "educational_guidance",
      });
    }
  }

  return allSources;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliOptions {
  dryRun: boolean;
  force: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let dryRun = false;
  let force = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--force") {
      force = true;
    }
  }

  return { dryRun, force };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun, force } = parseArgs();

  if (dryRun) {
    logger.info("DRY RUN: No changes will be written to DynamoDB");
  }

  // Load sources from JSON
  const sources = await loadSourcesFromJson();
  logger.info(`Loaded ${sources.length} source(s) from JSON files`);

  if (sources.length === 0) {
    logger.warn("No sources found. Exiting.");
    return;
  }

  // Preview sources
  logger.info("Sources to migrate:");
  for (const src of sources) {
    logger.info(`  - ${src.id}: ${src.title} (${src.format})`);
  }

  if (dryRun) {
    logger.info("DRY RUN complete. No changes made.");
    return;
  }

  // Create entity
  const entity = createSourceConfigEntity();

  let created = 0;
  let skipped = 0;
  let updated = 0;
  let errors = 0;

  for (const src of sources) {
    try {
      // Check if item already exists
      const existing = await entity.getById(src.id);

      if (existing && !force) {
        logger.info(
          `Skipping ${src.id} (already exists, use --force to overwrite)`,
        );
        skipped++;
        continue;
      }

      if (existing && force) {
        // Delete existing and recreate
        await entity.delete(src.id);
        await entity.create(src);
        logger.info(`Updated ${src.id}`);
        updated++;
      } else {
        // Create new
        await entity.create(src);
        logger.info(`Created ${src.id}`);
        created++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error migrating ${src.id}: ${message}`);
      errors++;
    }
  }

  logger.info("Migration complete:");
  logger.info(`  Created: ${created}`);
  logger.info(`  Updated: ${updated}`);
  logger.info(`  Skipped: ${skipped}`);
  logger.info(`  Errors:  ${errors}`);

  if (errors > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error(
    `Fatal error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
