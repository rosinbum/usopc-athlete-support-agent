#!/usr/bin/env tsx
/**
 * CLI for managing source configurations in DynamoDB.
 *
 * Usage:
 *   pnpm sources list [--enabled-only] [--ngb <id>]
 *   pnpm sources show <id>
 *   pnpm sources enable <id>
 *   pnpm sources disable <id>
 *   pnpm sources validate [--fix-broken]
 *
 * Environment variables:
 *   SOURCE_CONFIG_TABLE_NAME — DynamoDB table name (or use SST Resource)
 */

import {
  createLogger,
  type AuthorityLevel,
  AUTHORITY_LEVELS,
} from "@usopc/shared";
import {
  createSourceConfigEntity,
  type SourceConfig,
} from "../entities/index.js";

const logger = createLogger({ service: "sources-cli" });

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface ListOptions {
  enabledOnly: boolean;
  ngbId?: string;
}

interface Command {
  name: "list" | "show" | "enable" | "disable" | "validate";
  args: string[];
  options: ListOptions & { fixBroken: boolean };
}

function parseArgs(): Command {
  const args = process.argv.slice(2);
  const command = args[0] as Command["name"];
  const commandArgs: string[] = [];
  const options: Command["options"] = {
    enabledOnly: false,
    fixBroken: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--enabled-only") {
      options.enabledOnly = true;
    } else if (arg === "--ngb" && args[i + 1]) {
      options.ngbId = args[i + 1];
      i++;
    } else if (arg === "--fix-broken") {
      options.fixBroken = true;
    } else if (!arg.startsWith("--")) {
      commandArgs.push(arg);
    }
  }

  return { name: command, args: commandArgs, options };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function listSources(options: ListOptions): Promise<void> {
  const entity = createSourceConfigEntity();

  let sources: SourceConfig[];

  if (options.ngbId) {
    sources = await entity.getByNgb(options.ngbId);
    logger.info(`Sources for NGB ${options.ngbId}:`);
  } else if (options.enabledOnly) {
    sources = await entity.getAllEnabled();
    logger.info("Enabled sources:");
  } else {
    // Get all sources by querying enabled and disabled
    const enabled = await entity.getAllEnabled();
    // Note: To get all sources we'd need a scan or another index
    // For now, we just show enabled sources and mention the limitation
    sources = enabled;
    logger.info("Sources (enabled only - use getAllEnabled index):");
  }

  if (sources.length === 0) {
    logger.info("  (none)");
    return;
  }

  // Sort by priority, then by ID
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  sources.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.id.localeCompare(b.id);
  });

  // Display sources
  for (const src of sources) {
    const status = src.enabled ? "✓" : "✗";
    const failures =
      src.consecutiveFailures > 0
        ? ` [${src.consecutiveFailures} failures]`
        : "";
    const lastIngested = src.lastIngestedAt
      ? ` (last: ${new Date(src.lastIngestedAt).toLocaleDateString()})`
      : " (never ingested)";

    console.log(
      `  ${status} [${src.priority}] ${src.id}: ${src.title}${failures}${lastIngested}`,
    );
  }

  console.log(`\nTotal: ${sources.length} source(s)`);
}

async function showSource(id: string): Promise<void> {
  const entity = createSourceConfigEntity();
  const source = await entity.getById(id);

  if (!source) {
    logger.error(`Source not found: ${id}`);
    process.exit(1);
  }

  console.log("\nSource Configuration:");
  console.log("─".repeat(50));
  console.log(`  ID:                 ${source.id}`);
  console.log(`  Title:              ${source.title}`);
  console.log(`  URL:                ${source.url}`);
  console.log(`  Format:             ${source.format}`);
  console.log(`  Document Type:      ${source.documentType}`);
  console.log(`  Authority Level:    ${source.authorityLevel}`);
  console.log(`  Priority:           ${source.priority}`);
  console.log(`  NGB ID:             ${source.ngbId ?? "(universal)"}`);
  console.log(`  Topic Domains:      ${source.topicDomains.join(", ")}`);
  console.log(`  Description:        ${source.description}`);
  console.log("");
  console.log("Status:");
  console.log("─".repeat(50));
  console.log(`  Enabled:            ${source.enabled ? "Yes" : "No"}`);
  console.log(`  Last Ingested:      ${source.lastIngestedAt ?? "Never"}`);
  console.log(`  Last Content Hash:  ${source.lastContentHash ?? "None"}`);
  console.log(`  Consecutive Fails:  ${source.consecutiveFailures}`);
  console.log(`  Last Error:         ${source.lastError ?? "None"}`);
  console.log(`  S3 Key:             ${source.s3Key ?? "None"}`);
  console.log(`  S3 Version:         ${source.s3VersionId ?? "None"}`);
  console.log("");
  console.log("Timestamps:");
  console.log("─".repeat(50));
  console.log(`  Created:            ${source.createdAt}`);
  console.log(`  Updated:            ${source.updatedAt}`);
}

async function enableSource(id: string): Promise<void> {
  const entity = createSourceConfigEntity();
  const source = await entity.getById(id);

  if (!source) {
    logger.error(`Source not found: ${id}`);
    process.exit(1);
  }

  if (source.enabled) {
    logger.info(`Source ${id} is already enabled`);
    return;
  }

  await entity.enable(id);
  logger.info(`Enabled source: ${id}`);
}

async function disableSource(id: string): Promise<void> {
  const entity = createSourceConfigEntity();
  const source = await entity.getById(id);

  if (!source) {
    logger.error(`Source not found: ${id}`);
    process.exit(1);
  }

  if (!source.enabled) {
    logger.info(`Source ${id} is already disabled`);
    return;
  }

  await entity.disable(id);
  logger.info(`Disabled source: ${id}`);
}

async function validateSources(fixBroken: boolean): Promise<void> {
  const entity = createSourceConfigEntity();
  const sources = await entity.getAllEnabled();

  logger.info(`Validating ${sources.length} enabled source(s)...`);

  let valid = 0;
  let invalid = 0;
  let fixed = 0;

  for (const src of sources) {
    const issues: string[] = [];

    // Check URL is valid
    try {
      new URL(src.url);
    } catch {
      issues.push(`Invalid URL: ${src.url}`);
    }

    // Check authority level is valid
    if (!AUTHORITY_LEVELS.includes(src.authorityLevel as AuthorityLevel)) {
      issues.push(`Invalid authority level: ${src.authorityLevel}`);
    }

    // Check for repeated failures
    if (src.consecutiveFailures >= 3) {
      issues.push(`High failure count: ${src.consecutiveFailures}`);
    }

    if (issues.length > 0) {
      logger.warn(`${src.id}: ${issues.length} issue(s)`);
      for (const issue of issues) {
        logger.warn(`  - ${issue}`);
      }
      invalid++;

      // Optionally disable sources with too many failures
      if (fixBroken && src.consecutiveFailures >= 5) {
        logger.info(`  -> Disabling ${src.id} due to repeated failures`);
        await entity.disable(src.id);
        fixed++;
      }
    } else {
      valid++;
    }
  }

  console.log("\nValidation Summary:");
  console.log(`  Valid:   ${valid}`);
  console.log(`  Invalid: ${invalid}`);
  if (fixBroken) {
    console.log(`  Fixed:   ${fixed}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { name, args, options } = parseArgs();

  switch (name) {
    case "list":
      await listSources(options);
      break;

    case "show":
      if (!args[0]) {
        logger.error("Usage: sources show <id>");
        process.exit(1);
      }
      await showSource(args[0]);
      break;

    case "enable":
      if (!args[0]) {
        logger.error("Usage: sources enable <id>");
        process.exit(1);
      }
      await enableSource(args[0]);
      break;

    case "disable":
      if (!args[0]) {
        logger.error("Usage: sources disable <id>");
        process.exit(1);
      }
      await disableSource(args[0]);
      break;

    case "validate":
      await validateSources(options.fixBroken);
      break;

    default:
      console.log(`
Source Configuration CLI

Usage:
  pnpm sources list [--enabled-only] [--ngb <id>]
  pnpm sources show <id>
  pnpm sources enable <id>
  pnpm sources disable <id>
  pnpm sources validate [--fix-broken]

Commands:
  list      List all sources (or filter by NGB)
  show      Show detailed info for a source
  enable    Enable a disabled source
  disable   Disable an enabled source
  validate  Check sources for issues

Options:
  --enabled-only   Only show enabled sources (list)
  --ngb <id>       Filter by NGB ID (list)
  --fix-broken     Auto-disable sources with 5+ failures (validate)
`);
      process.exit(name ? 1 : 0);
  }
}

main().catch((error) => {
  logger.error(
    `Fatal error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
