#!/usr/bin/env tsx

/**
 * Runs quality review scenarios through the full agent pipeline and logs
 * traces to LangSmith under the `usopc-quality-review` project.
 *
 * Usage:
 *   pnpm --filter @usopc/evals quality:run
 *   pnpm --filter @usopc/evals quality:run -- --category boundary
 *   pnpm --filter @usopc/evals quality:run -- --tag sprint-42
 *   pnpm --filter @usopc/evals quality:run -- --category multi_turn --tag v2-test
 */

import { resolveEnv } from "../helpers/resolveEnv.js";

// Bridge SST Resource bindings → env vars before any SDK is loaded
resolveEnv();

import { traceable } from "langsmith/traceable";
import { QUALITY_REVIEW_PROJECT } from "../config.js";
import { runPipeline } from "../helpers/pipeline.js";
import { runMultiTurnPipeline } from "../helpers/multiTurnPipeline.js";
import {
  qualityReviewScenarios,
  type QualityReviewScenario,
} from "../quality-review/scenarios.js";

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { category?: string; tag?: string } {
  const args = process.argv.slice(2);
  const result: { category?: string; tag?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--category" && args[i + 1]) {
      result.category = args[++i];
    } else if (args[i] === "--tag" && args[i + 1]) {
      result.tag = args[++i];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

function isMultiTurn(scenario: QualityReviewScenario): boolean {
  return (
    scenario.input.messages.length > 1 ||
    scenario.input.messages.some((m) => m.role === "assistant")
  );
}

async function runScenario(
  scenario: QualityReviewScenario,
  tag?: string,
): Promise<{ answer: string; trajectory: string[]; durationMs: number }> {
  const metadata: Record<string, unknown> = {
    scenario_id: scenario.id,
    category: scenario.metadata.category,
    difficulty: scenario.metadata.difficulty,
    domains: scenario.metadata.domains,
    description: scenario.metadata.description,
  };
  if (tag) metadata.tag = tag;
  if (scenario.input.userSport) {
    metadata.user_sport = scenario.input.userSport;
  }

  // Set project env var so LangChain auto-tracing goes to the right project
  process.env.LANGCHAIN_PROJECT = QUALITY_REVIEW_PROJECT;
  process.env.LANGSMITH_TRACING = "true";

  const traced = traceable(
    async (input: {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      userSport?: string;
      scenarioId: string;
      description: string;
    }) => {
      const start = Date.now();
      let answer: string;
      let trajectory: string[];

      if (isMultiTurn(scenario)) {
        const result = await runMultiTurnPipeline(input.messages, {
          userSport: input.userSport,
        });
        answer = result.state.answer ?? "";
        trajectory = result.trajectory;
      } else {
        const result = await runPipeline(input.messages[0].content);
        answer = result.state.answer ?? "";
        trajectory = result.trajectory;
      }

      const durationMs = Date.now() - start;
      return { answer, trajectory, durationMs };
    },
    {
      name: `quality-review: ${scenario.id}`,
      project_name: QUALITY_REVIEW_PROJECT,
      run_type: "chain",
      metadata,
      tags: [
        scenario.metadata.category,
        scenario.metadata.difficulty,
        ...(tag ? [tag] : []),
      ],
    },
  );

  return await traced({
    messages: scenario.input.messages,
    userSport: scenario.input.userSport,
    scenarioId: scenario.id,
    description: scenario.metadata.description,
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { category, tag } = parseArgs();

  let scenarios = qualityReviewScenarios;
  if (category) {
    scenarios = scenarios.filter((s) => s.metadata.category === category);
    if (scenarios.length === 0) {
      console.error(`No scenarios found for category: ${category}`);
      console.error(
        "Available categories: sport_specific, cross_domain, multi_turn, ambiguous, emotional_urgent, boundary, paralympic, financial, procedural_deep, current_events",
      );
      process.exit(1);
    }
  }

  console.log(`Running ${scenarios.length} quality review scenarios`);
  if (category) console.log(`  Category filter: ${category}`);
  if (tag) console.log(`  Tag: ${tag}`);
  console.log(`  LangSmith project: ${QUALITY_REVIEW_PROJECT}`);
  console.log();

  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    const label = `[${scenario.id}] ${scenario.metadata.description}`;
    process.stdout.write(`  ⏳ ${label}...`);

    try {
      const result = await runScenario(scenario, tag);
      passed++;
      console.log(
        `\r  ✓ ${label} (${(result.durationMs / 1000).toFixed(1)}s, ${result.trajectory.join(" → ")})`,
      );
    } catch (error) {
      failed++;
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`\r  ✗ ${label}`);
      console.log(`    Error: ${msg}`);
    }
  }

  console.log();
  console.log(
    `Done. ${passed} passed, ${failed} failed out of ${scenarios.length} scenarios.`,
  );
  console.log(
    `View traces: https://smith.langchain.com → project "${QUALITY_REVIEW_PROJECT}"`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
