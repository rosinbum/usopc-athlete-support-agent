import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLogger } from "@usopc/shared";
import { createDiscoveryOrchestrator } from "../discoveryOrchestrator.js";
import { createCostTracker } from "../services/costTracker.js";
import { createNotificationService } from "../services/notificationService.js";
import type {
  DiscoveryCompletionSummary,
  BudgetAlert,
} from "../services/notificationService.js";
import type { EventBridgeEvent } from "aws-lambda";

const logger = createLogger({ service: "discovery-lambda" });

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
 * In production, this file is packaged with the Lambda.
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
// Lambda Handler
// ---------------------------------------------------------------------------

/**
 * EventBridge-triggered Lambda for automated source discovery.
 *
 * Flow:
 * 1. Load discovery config from JSON file
 * 2. Create orchestrator, cost tracker, and notification service
 * 3. Run discovery from domains and search queries
 * 4. Track costs (Tavily and Anthropic usage)
 * 5. Check budget status and send alerts if needed
 * 6. Send completion summary notification
 * 7. Handle errors gracefully with proper logging and notifications
 *
 * Environment Variables:
 * - DISCOVERY_CONFIG_PATH: Path to discovery-config.json (optional)
 * - TAVILY_MONTHLY_BUDGET: Tavily credits budget (default: 1000)
 * - ANTHROPIC_MONTHLY_BUDGET: Anthropic cost budget in dollars (default: $10)
 * - SLACK_WEBHOOK_URL: Slack webhook for notifications (optional)
 * - NOTIFICATION_EMAIL: Email for SES notifications (optional)
 * - SES_FROM_EMAIL: From address for SES emails (default: noreply@usopc.org)
 */
export async function handler(
  event: EventBridgeEvent<"Scheduled Event", unknown>,
): Promise<void> {
  const startTime = Date.now();
  const errors: string[] = [];

  logger.info("Discovery Lambda triggered", {
    eventId: event.id,
    time: event.time,
  });

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

    // Create orchestrator
    const orchestrator = createDiscoveryOrchestrator({
      autoApprovalThreshold: config.autoApprovalThreshold,
      concurrency: 3,
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
        evaluated: domainStats.evaluated,
        approved: domainStats.approved,
        rejected: domainStats.rejected,
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
        evaluated: searchStats.evaluated,
        approved: searchStats.approved,
        rejected: searchStats.rejected,
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

    // Track Anthropic usage
    // Estimate: Each evaluation uses ~2000 input + ~500 output tokens
    const evaluatedCount = finalStats.evaluated;
    const estimatedInputTokens = evaluatedCount * 2000;
    const estimatedOutputTokens = evaluatedCount * 500;

    if (evaluatedCount > 0) {
      await costTracker.trackAnthropicCall(
        estimatedInputTokens,
        estimatedOutputTokens,
      );
    }

    // Get cost summary
    const tavilyStats = await costTracker.getUsageStats("tavily", "daily");
    const anthropicStats = await costTracker.getUsageStats(
      "anthropic",
      "daily",
    );

    // Build completion summary
    const summary: DiscoveryCompletionSummary = {
      totalDiscovered: finalStats.discovered,
      byMethod: {
        map: domainStats.discovered,
        search: searchStats.discovered,
      },
      byStatus: {
        approved: finalStats.approved,
        rejected: finalStats.rejected,
        pending: finalStats.evaluated - finalStats.approved - finalStats.rejected,
      },
      costSummary: {
        tavilyCredits: tavilyStats.tavily?.estimatedCredits ?? 0,
        anthropicCost: anthropicStats.anthropic?.estimatedCost ?? 0,
      },
      duration: Date.now() - startTime,
      errors,
    };

    // Send completion notification
    await notificationService.sendDiscoveryCompletion(summary);

    logger.info("Discovery Lambda complete", {
      summary,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    logger.error("Discovery Lambda failed", {
      error: errorMsg,
      duration: Date.now() - startTime,
    });

    // Send error notification
    await notificationService.sendError("discovery-lambda", error as Error, {
      eventId: event.id,
      duration: Date.now() - startTime,
    });

    throw error;
  }
}
