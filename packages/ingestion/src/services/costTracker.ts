import { createLogger, createAppTable } from "@usopc/shared";
import { getAppTableName } from "../entities/index.js";

const logger = createLogger({ service: "cost-tracker" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TavilyUsage {
  calls: number;
  estimatedCredits: number;
}

export interface AnthropicUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number; // in dollars
}

export interface UsageStats {
  service: "tavily" | "anthropic";
  period: "daily" | "weekly" | "monthly";
  date: string;
  tavily?: TavilyUsage;
  anthropic?: AnthropicUsage;
}

export interface BudgetStatus {
  withinBudget: boolean;
  service: "tavily" | "anthropic";
  period: "monthly";
  usage: number;
  budget: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAVILY_CREDITS_PER_SEARCH = 1;
const TAVILY_CREDITS_PER_MAP = 5;

// Anthropic Claude Sonnet 4 pricing (as of Feb 2026)
// Input: $3.00 per million tokens
// Output: $15.00 per million tokens
const ANTHROPIC_INPUT_COST_PER_MILLION = 3.0;
const ANTHROPIC_OUTPUT_COST_PER_MILLION = 15.0;

// Default budgets
const DEFAULT_TAVILY_MONTHLY_BUDGET = 1000; // credits
const DEFAULT_ANTHROPIC_MONTHLY_BUDGET = 10; // dollars

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get the current date in ISO format (YYYY-MM-DD)
 */
function getCurrentDate(): string {
  return new Date().toISOString().split("T")[0]!;
}

/**
 * Get the start date for a given period
 */
function getPeriodStart(period: "daily" | "weekly" | "monthly"): string {
  const now = new Date();

  if (period === "daily") {
    return now.toISOString().split("T")[0]!;
  }

  if (period === "weekly") {
    // Get Monday of current week
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    return monday.toISOString().split("T")[0]!;
  }

  // monthly
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Calculate Anthropic API cost from token usage
 */
function calculateAnthropicCost(
  inputTokens: number,
  outputTokens: number,
): number {
  const inputCost =
    (inputTokens / 1_000_000) * ANTHROPIC_INPUT_COST_PER_MILLION;
  const outputCost =
    (outputTokens / 1_000_000) * ANTHROPIC_OUTPUT_COST_PER_MILLION;
  return inputCost + outputCost;
}

// ---------------------------------------------------------------------------
// CostTracker
// ---------------------------------------------------------------------------

/**
 * Service for tracking API usage costs and enforcing budgets.
 *
 * Features:
 * - Track Tavily API usage (calls and estimated credits)
 * - Track Anthropic API usage (calls, tokens, estimated cost)
 * - Store daily/weekly/monthly metrics in DynamoDB
 * - Budget threshold checks with environment variables
 * - Supports multiple periods for rollup queries
 */
export class CostTracker {
  private table: ReturnType<typeof createAppTable>;
  private model;

  constructor(table?: ReturnType<typeof createAppTable>) {
    if (table) {
      this.table = table;
    } else {
      this.table = createAppTable(getAppTableName());
    }

    this.model = this.table.getModel("UsageMetric");
  }

  // ---------------------------------------------------------------------------
  // Tracking Methods
  // ---------------------------------------------------------------------------

  /**
   * Track a Tavily API call.
   * Automatically estimates credits based on the method (search = 1, map = 5).
   */
  async trackTavilyCall(method: "search" | "map"): Promise<void> {
    const credits =
      method === "map" ? TAVILY_CREDITS_PER_MAP : TAVILY_CREDITS_PER_SEARCH;

    logger.info(`Tracking Tavily ${method} call (${credits} credits)`, {
      method,
      credits,
    });

    await this.incrementMetrics("tavily", {
      tavilyCalls: 1,
      tavilyCredits: credits,
    });
  }

  /**
   * Track an Anthropic API call with token usage.
   */
  async trackAnthropicCall(
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const cost = calculateAnthropicCost(inputTokens, outputTokens);

    logger.info(
      `Tracking Anthropic call (${inputTokens} in, ${outputTokens} out, $${cost.toFixed(4)})`,
      {
        inputTokens,
        outputTokens,
        cost,
      },
    );

    await this.incrementMetrics("anthropic", {
      anthropicCalls: 1,
      anthropicInputTokens: inputTokens,
      anthropicOutputTokens: outputTokens,
      anthropicCost: cost,
    });
  }

  /**
   * Increment usage metrics for all periods (daily, weekly, monthly).
   */
  private async incrementMetrics(
    service: "tavily" | "anthropic",
    increments: {
      tavilyCalls?: number;
      tavilyCredits?: number;
      anthropicCalls?: number;
      anthropicInputTokens?: number;
      anthropicOutputTokens?: number;
      anthropicCost?: number;
    },
  ): Promise<void> {
    const periods: Array<"daily" | "weekly" | "monthly"> = [
      "daily",
      "weekly",
      "monthly",
    ];

    for (const period of periods) {
      const date = getPeriodStart(period);
      const pk = `Usage#${service}`;
      const sk = `${period}#${date}`;

      try {
        await this.model.update(
          { service, period, date },
          {
            add: increments,
            exists: null, // Create if doesn't exist
          },
        );
      } catch (error) {
        logger.error(`Error incrementing ${service} ${period} metrics`, {
          service,
          period,
          date,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Budget Checks
  // ---------------------------------------------------------------------------

  /**
   * Check if current usage is within budget for a service.
   * Uses environment variables for budget limits:
   * - TAVILY_MONTHLY_BUDGET (default: 1000 credits)
   * - ANTHROPIC_MONTHLY_BUDGET (default: $10)
   */
  async checkBudget(service: "tavily" | "anthropic"): Promise<BudgetStatus> {
    const budget =
      service === "tavily"
        ? parseInt(
            process.env.TAVILY_MONTHLY_BUDGET ??
              String(DEFAULT_TAVILY_MONTHLY_BUDGET),
            10,
          )
        : parseFloat(
            process.env.ANTHROPIC_MONTHLY_BUDGET ??
              String(DEFAULT_ANTHROPIC_MONTHLY_BUDGET),
          );

    const stats = await this.getUsageStats(service, "monthly");

    let usage = 0;
    if (service === "tavily" && stats.tavily) {
      usage = stats.tavily.estimatedCredits;
    } else if (service === "anthropic" && stats.anthropic) {
      usage = stats.anthropic.estimatedCost;
    }

    const percentage = budget > 0 ? (usage / budget) * 100 : 0;
    const withinBudget = usage <= budget;

    logger.info(`Budget check for ${service}`, {
      service,
      usage,
      budget,
      percentage,
      withinBudget,
    });

    return {
      withinBudget,
      service,
      period: "monthly",
      usage,
      budget,
      percentage,
    };
  }

  /**
   * Check all service budgets and return status for each.
   */
  async checkAllBudgets(): Promise<BudgetStatus[]> {
    const services: Array<"tavily" | "anthropic"> = ["tavily", "anthropic"];
    const results: BudgetStatus[] = [];

    for (const service of services) {
      results.push(await this.checkBudget(service));
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Query Methods
  // ---------------------------------------------------------------------------

  /**
   * Get usage statistics for a service and period.
   */
  async getUsageStats(
    service: "tavily" | "anthropic",
    period: "daily" | "weekly" | "monthly",
  ): Promise<UsageStats> {
    const date = getPeriodStart(period);

    try {
      const item = await this.model.get({ service, period, date });

      const stats: UsageStats = {
        service,
        period,
        date,
      };

      if (item) {
        if (service === "tavily") {
          stats.tavily = {
            calls: (item.tavilyCalls as number) ?? 0,
            estimatedCredits: (item.tavilyCredits as number) ?? 0,
          };
        } else {
          stats.anthropic = {
            calls: (item.anthropicCalls as number) ?? 0,
            inputTokens: (item.anthropicInputTokens as number) ?? 0,
            outputTokens: (item.anthropicOutputTokens as number) ?? 0,
            estimatedCost: (item.anthropicCost as number) ?? 0,
          };
        }
      } else {
        // No data yet, return zeros
        if (service === "tavily") {
          stats.tavily = { calls: 0, estimatedCredits: 0 };
        } else {
          stats.anthropic = {
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: 0,
          };
        }
      }

      return stats;
    } catch (error) {
      logger.error(`Error getting usage stats for ${service} ${period}`, {
        service,
        period,
        date,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all usage statistics (all services, all periods).
   */
  async getAllUsageStats(): Promise<UsageStats[]> {
    const services: Array<"tavily" | "anthropic"> = ["tavily", "anthropic"];
    const periods: Array<"daily" | "weekly" | "monthly"> = [
      "daily",
      "weekly",
      "monthly",
    ];
    const results: UsageStats[] = [];

    for (const service of services) {
      for (const period of periods) {
        results.push(await this.getUsageStats(service, period));
      }
    }

    return results;
  }
}

/**
 * Create a CostTracker instance.
 * Useful for dependency injection and testing.
 */
export function createCostTracker(
  table?: ReturnType<typeof createAppTable>,
): CostTracker {
  return new CostTracker(table);
}
