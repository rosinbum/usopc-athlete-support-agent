import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createLogger,
  createNotificationService,
  type DiscoveryCompletionSummary,
  type BudgetAlert,
} from "@usopc/shared";
import { createDiscoveryOrchestrator } from "../discoveryOrchestrator.js";
import { createCostTracker } from "../services/costTracker.js";

const logger = createLogger({ service: "discovery" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscoveryConfigFile {
  domains: string[];
  searchQueries: string[];
  maxResultsPerDomain: number;
  maxResultsPerQuery: number;
  autoApprovalThreshold: number;
}

// ---------------------------------------------------------------------------
// Config Loading
// ---------------------------------------------------------------------------

/**
 * Load discovery configuration from JSON file.
 * In production, this file is packaged with the container image.
 */
async function loadDiscoveryConfig(): Promise<DiscoveryConfigFile> {
  const configPath =
    process.env.DISCOVERY_CONFIG_PATH ??
    resolve(
      import.meta.dirname ?? __dirname,
      "../../../../../data/discovery-config.json",
    );

  logger.info(`Loading discovery config from: ${configPath}`);

  const raw = await readFile(configPath, "utf-8");
  const config = JSON.parse(raw) as DiscoveryConfigFile;

  logger.info("Discovery config loaded", {
    domains: config.domains.length,
    queries: config.searchQueries.length,
  });

  return config;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Scheduled discovery handler (triggered by Cloud Scheduler or manual invocation).
 *
 * Flow:
 * 1. Load discovery config from JSON file
 * 2. Create orchestrator, cost tracker, and notification service
 * 3. Run discovery from domains and search queries
 * 4. Track costs (Tavily and Anthropic usage)
 * 5. Check budget status and send alerts if needed
 * 6. Send completion summary notification
 * 7. Handle errors gracefully with proper logging and notifications
 */
export async function handler(): Promise<void> {
  const startTime = Date.now();
  const errors: string[] = [];

  logger.info("Discovery handler triggered");

  // Initialize services
  const costTracker = createCostTracker();
  const notificationService = createNotificationService();

  try {
    // Check budgets before starting
    logger.info("Checking budgets before discovery");
    const budgetStatuses = await costTracker.checkAllBudgets();

    for (const status of budgetStatuses) {
      if (!status.withinBudget) {
        const alert: BudgetAlert = {
          service: status.service,
          usage: status.usage,
          budget: status.budget,
          percentage: status.percentage,
          threshold: "critical",
        };

        await notificationService.sendBudgetAlert(alert);

        const errorMsg = `Budget exceeded for ${status.service}: ${status.usage} > ${status.budget}`;
        logger.error(errorMsg);
        errors.push(errorMsg);

        // Stop execution if budget is exceeded
        throw new Error(errorMsg);
      } else if (status.percentage >= 80) {
        // Send warning at 80%
        const alert: BudgetAlert = {
          service: status.service,
          usage: status.usage,
          budget: status.budget,
          percentage: status.percentage,
          threshold: "warning",
        };

        await notificationService.sendBudgetAlert(alert);
      }
    }

    // Load discovery configuration
    const config = await loadDiscoveryConfig();

    // Create orchestrator (enqueue-only; evaluation happens in discovery feed worker)
    const orchestrator = createDiscoveryOrchestrator({
      autoApprovalThreshold: config.autoApprovalThreshold,
      dryRun: false,
    });

    // Track Tavily calls for domains
    const totalMapCalls = config.domains.length;
    for (let i = 0; i < totalMapCalls; i++) {
      await costTracker.trackTavilyCall("map");
    }

    // Track Tavily calls for search queries
    const totalSearchCalls = config.searchQueries.length;
    for (let i = 0; i < totalSearchCalls; i++) {
      await costTracker.trackTavilyCall("search");
    }

    // Run discovery from domains
    logger.info("Starting domain discovery", {
      domains: config.domains.length,
    });

    let domainStats;
    try {
      domainStats = await orchestrator.discoverFromDomains(
        config.domains,
        config.maxResultsPerDomain,
      );
      logger.info("Domain discovery complete", {
        discovered: domainStats.discovered,
        enqueued: domainStats.enqueued,
        skipped: domainStats.skipped,
        errors: domainStats.errors,
      });
    } catch (error) {
      const errorMsg = `Domain discovery failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      errors.push(errorMsg);
      // Continue with search queries even if domain discovery fails
      domainStats = orchestrator.getStats();
    }

    // Run discovery from search queries
    logger.info("Starting search query discovery", {
      queries: config.searchQueries.length,
    });

    let searchStats;
    try {
      searchStats = await orchestrator.discoverFromSearchQueries(
        config.searchQueries,
        config.maxResultsPerQuery,
        config.domains, // Scope searches to configured domains
      );
      logger.info("Search query discovery complete", {
        discovered: searchStats.discovered,
        enqueued: searchStats.enqueued,
        skipped: searchStats.skipped,
        errors: searchStats.errors,
      });
    } catch (error) {
      const errorMsg = `Search query discovery failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      errors.push(errorMsg);
      searchStats = orchestrator.getStats();
    }

    // Get final stats
    const finalStats = orchestrator.getStats();

    // Get cost summary (Tavily only — Anthropic eval happens async in worker)
    const tavilyStats = await costTracker.getUsageStats("tavily", "daily");

    // Build completion summary
    // Note: evaluation stats (approved/rejected/pending) are no longer tracked
    // here — they happen asynchronously in the DiscoveryFeedWorker Lambda.
    const summary: DiscoveryCompletionSummary = {
      totalDiscovered: finalStats.discovered,
      byMethod: {
        map: domainStats.discovered,
        search: searchStats.discovered - domainStats.discovered,
      },
      byStatus: {
        approved: 0,
        rejected: 0,
        pending: finalStats.enqueued,
      },
      costSummary: {
        tavilyCredits: tavilyStats.tavily?.estimatedCredits ?? 0,
        anthropicCost: 0,
      },
      duration: Date.now() - startTime,
      errors,
    };

    // Send completion notification
    await notificationService.sendDiscoveryCompletion(summary);

    logger.info("Discovery handler complete", {
      summary,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("Discovery handler failed", {
      error: errorMsg,
      duration: Date.now() - startTime,
    });

    // Send error notification
    await notificationService.sendError("discovery", error as Error, {
      duration: Date.now() - startTime,
    });

    throw error;
  }
}
