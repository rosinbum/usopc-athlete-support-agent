import {
  createLogger,
  getPool,
  parseEnvInt,
  parseEnvFloat,
} from "@usopc/shared";
import type { Pool } from "pg";

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

function getPeriodStart(period: "daily" | "weekly" | "monthly"): string {
  const now = new Date();

  if (period === "daily") {
    return now.toISOString().split("T")[0]!;
  }

  if (period === "weekly") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    return monday.toISOString().split("T")[0]!;
  }

  // monthly
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

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

export class CostTracker {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

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

      try {
        await this.pool.query(
          `INSERT INTO usage_metrics (service, period, date,
             tavily_calls, tavily_credits,
             anthropic_calls, anthropic_input_tokens, anthropic_output_tokens, anthropic_cost)
           VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (service, period, date) DO UPDATE SET
             tavily_calls = usage_metrics.tavily_calls + EXCLUDED.tavily_calls,
             tavily_credits = usage_metrics.tavily_credits + EXCLUDED.tavily_credits,
             anthropic_calls = usage_metrics.anthropic_calls + EXCLUDED.anthropic_calls,
             anthropic_input_tokens = usage_metrics.anthropic_input_tokens + EXCLUDED.anthropic_input_tokens,
             anthropic_output_tokens = usage_metrics.anthropic_output_tokens + EXCLUDED.anthropic_output_tokens,
             anthropic_cost = usage_metrics.anthropic_cost + EXCLUDED.anthropic_cost,
             updated_at = NOW()`,
          [
            service,
            period,
            date,
            increments.tavilyCalls ?? 0,
            increments.tavilyCredits ?? 0,
            increments.anthropicCalls ?? 0,
            increments.anthropicInputTokens ?? 0,
            increments.anthropicOutputTokens ?? 0,
            increments.anthropicCost ?? 0,
          ],
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

  async checkBudget(service: "tavily" | "anthropic"): Promise<BudgetStatus> {
    const budget =
      service === "tavily"
        ? parseEnvInt("TAVILY_MONTHLY_BUDGET", DEFAULT_TAVILY_MONTHLY_BUDGET)
        : parseEnvFloat(
            "ANTHROPIC_MONTHLY_BUDGET",
            DEFAULT_ANTHROPIC_MONTHLY_BUDGET,
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

  async checkAllBudgets(): Promise<BudgetStatus[]> {
    const services: Array<"tavily" | "anthropic"> = ["tavily", "anthropic"];
    const results: BudgetStatus[] = [];

    for (const service of services) {
      results.push(await this.checkBudget(service));
    }

    return results;
  }

  async getUsageStats(
    service: "tavily" | "anthropic",
    period: "daily" | "weekly" | "monthly",
  ): Promise<UsageStats> {
    const date = getPeriodStart(period);

    try {
      const { rows } = await this.pool.query(
        "SELECT * FROM usage_metrics WHERE service = $1 AND period = $2 AND date = $3::date",
        [service, period, date],
      );

      const stats: UsageStats = { service, period, date };

      if (rows.length > 0) {
        const row = rows[0];
        if (service === "tavily") {
          stats.tavily = {
            calls: (row.tavily_calls as number) ?? 0,
            estimatedCredits: (row.tavily_credits as number) ?? 0,
          };
        } else {
          stats.anthropic = {
            calls: (row.anthropic_calls as number) ?? 0,
            inputTokens: (row.anthropic_input_tokens as number) ?? 0,
            outputTokens: (row.anthropic_output_tokens as number) ?? 0,
            estimatedCost: (row.anthropic_cost as number) ?? 0,
          };
        }
      } else {
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

export function createCostTracker(pool?: Pool): CostTracker {
  return new CostTracker(pool);
}
