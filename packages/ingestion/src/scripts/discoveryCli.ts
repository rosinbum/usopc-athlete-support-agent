import { createLogger } from "@usopc/shared";
import { readFile } from "fs/promises";
import { join } from "path";
import { createDiscoveryCoordinator } from "../discoveryCoordinator.js";

const logger = createLogger({ service: "discovery-cli" });

interface DiscoveryConfigFile {
  domains: string[];
  searchQueries: string[];
  maxResultsPerDomain: number;
  maxResultsPerQuery: number;
  autoApprovalThreshold: number;
}

async function main() {
  try {
    // Load discovery config
    const configPath = join(process.cwd(), "data/discovery-config.json");
    const configFile = await readFile(configPath, "utf-8");
    const config: DiscoveryConfigFile = JSON.parse(configFile);

    logger.info("Starting discovery run", {
      domains: config.domains.length,
      queries: config.searchQueries.length,
    });

    // Create coordinator
    const coordinator = createDiscoveryCoordinator({
      autoApprovalThreshold: config.autoApprovalThreshold,
    });

    // Run discovery from domains
    logger.info("Discovering from domains...");
    const domainStats = await coordinator.discoverFromDomains(
      config.domains,
      config.maxResultsPerDomain,
    );

    // Run discovery from search queries
    logger.info("Discovering from search queries...");
    const searchStats = await coordinator.discoverFromSearchQueries(
      config.searchQueries,
      config.maxResultsPerQuery,
      config.domains,
    );

    // Combine stats
    const totalStats = {
      discovered: domainStats.discovered + searchStats.discovered,
      evaluated: domainStats.evaluated + searchStats.evaluated,
      approved: domainStats.approved + searchStats.approved,
      rejected: domainStats.rejected + searchStats.rejected,
      errors: domainStats.errors + searchStats.errors,
    };

    logger.info("Discovery run complete", totalStats);

    console.log("\n=== Discovery Run Complete ===");
    console.log(`Discovered: ${totalStats.discovered} URLs`);
    console.log(`Evaluated: ${totalStats.evaluated} URLs`);
    console.log(`Approved: ${totalStats.approved} URLs`);
    console.log(`Rejected: ${totalStats.rejected} URLs`);
    console.log(`Errors: ${totalStats.errors}`);
  } catch (error) {
    logger.error("Discovery run failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
