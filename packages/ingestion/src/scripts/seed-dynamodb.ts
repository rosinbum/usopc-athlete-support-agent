#!/usr/bin/env tsx
/**
 * Seed DynamoDB with source configurations and sport organizations from JSON.
 *
 * Usage:
 *   pnpm seed:dynamodb              # Seed JSON -> DynamoDB
 *   pnpm seed:dynamodb --dry-run    # Preview only (no writes)
 *   pnpm seed:dynamodb --force      # Overwrite existing items
 *
 * Requires SST context (run via `pnpm seed:dynamodb` which uses `sst shell`)
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createLogger,
  type AuthorityLevel,
  createAppTable,
  SportOrgEntity,
  type SportOrganization,
} from "@usopc/shared";
import {
  createSourceConfigEntity,
  getAppTableName,
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
// Source Config seeding
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

async function seedSourceConfigs(options: CliOptions): Promise<void> {
  const sources = await loadSourcesFromJson();
  logger.info(`Loaded ${sources.length} source(s) from JSON files`);

  if (sources.length === 0) {
    logger.warn("No sources found.");
    return;
  }

  logger.info("Sources to seed:");
  for (const src of sources) {
    logger.info(`  - ${src.id}: ${src.title} (${src.format})`);
  }

  if (options.dryRun) {
    return;
  }

  const entity = createSourceConfigEntity();

  let created = 0;
  let skipped = 0;
  let updated = 0;
  let errors = 0;

  for (const src of sources) {
    try {
      const existing = await entity.getById(src.id);

      if (existing && !options.force) {
        logger.info(
          `Skipping ${src.id} (already exists, use --force to overwrite)`,
        );
        skipped++;
        continue;
      }

      if (existing && options.force) {
        await entity.delete(src.id);
        await entity.create(src);
        logger.info(`Updated ${src.id}`);
        updated++;
      } else {
        await entity.create(src);
        logger.info(`Created ${src.id}`);
        created++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error seeding source ${src.id}: ${message}`);
      errors++;
    }
  }

  logger.info(
    `Source Configs: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`,
  );
}

// ---------------------------------------------------------------------------
// Sport Organization seeding
// ---------------------------------------------------------------------------

function sportOrgsPath(): string {
  return resolve(
    import.meta.dirname ?? __dirname,
    "../../../../data/sport-organizations.json",
  );
}

async function loadSportOrgsFromJson(): Promise<SportOrganization[]> {
  const raw = await readFile(sportOrgsPath(), "utf-8");
  return JSON.parse(raw) as SportOrganization[];
}

async function seedSportOrgs(options: CliOptions): Promise<void> {
  const orgs = await loadSportOrgsFromJson();
  logger.info(`Loaded ${orgs.length} sport organization(s) from JSON`);

  if (orgs.length === 0) {
    logger.warn("No sport organizations found.");
    return;
  }

  if (options.dryRun) {
    for (const org of orgs) {
      logger.info(`  [DRY RUN] Would seed: ${org.id} (${org.officialName})`);
    }
    return;
  }

  const table = createAppTable(getAppTableName());
  const sportOrgEntity = new SportOrgEntity(table);

  let created = 0;
  let skipped = 0;
  let updated = 0;
  let errors = 0;

  for (const org of orgs) {
    try {
      const existing = await sportOrgEntity.getById(org.id);

      if (existing && !options.force) {
        logger.info(
          `Skipping ${org.id} (already exists, use --force to overwrite)`,
        );
        skipped++;
        continue;
      }

      if (existing && options.force) {
        await sportOrgEntity.delete(org.id);
        await sportOrgEntity.create(org);
        logger.info(`Updated ${org.id}`);
        updated++;
      } else {
        await sportOrgEntity.create(org);
        logger.info(`Created ${org.id}`);
        created++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error seeding sport org ${org.id}: ${msg}`);
      errors++;
    }
  }

  logger.info(
    `Sport Orgs: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.dryRun) {
    logger.info("DRY RUN: No changes will be written to DynamoDB");
  }

  // Seed source configurations
  logger.info("--- Seeding Source Configs ---");
  await seedSourceConfigs(options);

  // Seed sport organizations
  logger.info("--- Seeding Sport Organizations ---");
  await seedSportOrgs(options);

  if (options.dryRun) {
    logger.info("DRY RUN complete. No changes made.");
  } else {
    logger.info("Seeding complete.");
  }
}

main().catch((error) => {
  logger.error(
    `Fatal error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
