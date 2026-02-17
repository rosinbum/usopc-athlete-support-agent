import { createLogger } from "@usopc/shared";
import { readFile } from "fs/promises";
import { join } from "path";
import { createDiscoveryOrchestrator } from "../discoveryOrchestrator.js";
import type { DiscoveryStats } from "../discoveryOrchestrator.js";

const logger = createLogger({ service: "discovery-cli" });

interface DiscoveryConfigFile {
  domains: string[];
  searchQueries: string[];
  maxResultsPerDomain: number;
  maxResultsPerQuery: number;
  autoApprovalThreshold: number;
}

interface CliOptions {
  dryRun: boolean;
  domain?: string;
  query?: string;
  json: boolean;
}

/**
 * Parse CLI arguments.
 */
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--domain") {
      options.domain = args[++i];
    } else if (arg === "--query") {
      options.query = args[++i];
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return options;
}

/**
 * Print CLI help text.
 */
function printHelp(): void {
  console.log(`
USOPC Discovery CLI - Intelligent Source Discovery

USAGE:
  pnpm --filter @usopc/ingestion discovery [OPTIONS]

OPTIONS:
  --dry-run          Run discovery without enqueuing to SQS (useful for testing)
  --domain <domain>  Discover from a specific domain only (e.g., "usaswimming.org")
  --query <query>    Discover from a specific search query only
  --json             Output results as JSON
  --help, -h         Show this help message

EXAMPLES:
  # Full discovery run (all domains and queries)
  pnpm --filter @usopc/ingestion discovery

  # Dry run to preview without enqueuing
  pnpm --filter @usopc/ingestion discovery --dry-run

  # Discover from a specific domain
  pnpm --filter @usopc/ingestion discovery --domain usaswimming.org

  # Discover from a specific query
  pnpm --filter @usopc/ingestion discovery --query "USOPC team selection"

  # Output as JSON for scripting
  pnpm --filter @usopc/ingestion discovery --json

CONFIGURATION:
  Discovery configuration is loaded from: data/discovery-config.json
  `);
}

/**
 * Display real-time progress.
 */
function displayProgress(stats: DiscoveryStats): void {
  // Clear line and move cursor to start
  process.stdout.write("\r\x1b[K");
  process.stdout.write(
    `Progress: ${stats.discovered} discovered | ${stats.enqueued} enqueued | ` +
      `${stats.skipped} skipped | ${stats.errors} errors`,
  );
}

/**
 * Display final summary.
 */
function displaySummary(
  stats: DiscoveryStats,
  dryRun: boolean,
  json: boolean,
): void {
  if (json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log("\n");
  console.log("=".repeat(60));
  console.log(dryRun ? "Discovery Dry Run Complete" : "Discovery Run Complete");
  console.log("=".repeat(60));
  console.log(`Discovered:  ${stats.discovered} URLs`);
  console.log(`Enqueued:    ${stats.enqueued} URLs`);
  console.log(`Skipped:     ${stats.skipped} URLs (duplicates)`);
  console.log(`Errors:      ${stats.errors}`);
  console.log("=".repeat(60));

  if (dryRun) {
    console.log("\nNote: This was a dry run. No URLs were enqueued to SQS.");
  }
}

async function main() {
  try {
    const options = parseArgs();

    // Load discovery config
    const configPath = join(process.cwd(), "../../data/discovery-config.json");
    const configFile = await readFile(configPath, "utf-8");
    const config: DiscoveryConfigFile = JSON.parse(configFile);

    // Filter domains and queries based on CLI options
    const domains = options.domain ? [options.domain] : config.domains;
    const queries = options.query ? [options.query] : config.searchQueries;

    if (!options.json) {
      logger.info("Starting discovery run", {
        domains: domains.length,
        queries: queries.length,
        dryRun: options.dryRun,
      });

      console.log("\nDiscovery Configuration:");
      console.log(`  Domains: ${domains.length}`);
      console.log(`  Queries: ${queries.length}`);
      console.log(`  Auto-approval threshold: ${config.autoApprovalThreshold}`);
      console.log(`  Dry run: ${options.dryRun ? "Yes" : "No"}`);
      console.log("");
    }

    // Create orchestrator with progress callback
    const orchestrator = createDiscoveryOrchestrator({
      autoApprovalThreshold: config.autoApprovalThreshold,
      dryRun: options.dryRun,
      onProgress: options.json ? undefined : displayProgress,
    });

    // Run discovery from domains
    if (domains.length > 0) {
      if (!options.json) {
        logger.info("Discovering from domains...");
      }
      await orchestrator.discoverFromDomains(
        domains,
        config.maxResultsPerDomain,
      );
    }

    // Run discovery from search queries
    if (queries.length > 0) {
      if (!options.json) {
        logger.info("Discovering from search queries...");
      }
      await orchestrator.discoverFromSearchQueries(
        queries,
        config.maxResultsPerQuery,
        config.domains,
      );
    }

    // Get final stats
    const stats = orchestrator.getStats();

    if (!options.json) {
      logger.info("Discovery run complete", {
        discovered: stats.discovered,
        enqueued: stats.enqueued,
        errors: stats.errors,
        skipped: stats.skipped,
      });
    }

    displaySummary(stats, options.dryRun, options.json);
  } catch (error) {
    logger.error("Discovery run failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error("\nError:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
