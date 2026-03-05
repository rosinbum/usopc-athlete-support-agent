import * as ls from "langsmith/vitest";
import {
  qualityReviewScenarios,
  type QualityReviewScenario,
} from "../quality-review/scenarios.js";
import { runPipeline } from "../helpers/pipeline.js";
import { runMultiTurnPipeline } from "../helpers/multiTurnPipeline.js";

// ---------------------------------------------------------------------------
// Canary subset — 1-2 scenarios from each of the 10 categories
// ---------------------------------------------------------------------------

const CANARY_IDS = new Set([
  "sport-01",
  "sport-05",
  "cross-01",
  "multi-01",
  "multi-03",
  "ambig-01",
  "emot-01",
  "bound-01",
  "bound-03",
  "para-01",
  "fin-01",
  "proc-01",
  "curr-01",
]);

// ---------------------------------------------------------------------------
// Subset selection via QUALITY_REVIEW_SCOPE env var
// ---------------------------------------------------------------------------

const scope = process.env.QUALITY_REVIEW_SCOPE ?? "canary";

const scenarios: QualityReviewScenario[] =
  scope === "full"
    ? qualityReviewScenarios
    : qualityReviewScenarios.filter((s) => CANARY_IDS.has(s.id));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMultiTurn(scenario: QualityReviewScenario): boolean {
  return (
    scenario.input.messages.length > 1 ||
    scenario.input.messages.some((m) => m.role === "assistant")
  );
}

/** Map scenarios to the shape expected by `ls.test()`. */
const examples = scenarios.map((s) => ({
  inputs: {
    messages: s.input.messages,
    userSport: s.input.userSport ?? null,
    scenarioId: s.id,
    description: s.metadata.description,
  },
  referenceOutputs: {
    expected_path: s.expectedOutput?.expectedPath ?? null,
    required_facts: s.expectedOutput?.requiredFacts ?? null,
    reference_answer: s.expectedOutput?.referenceAnswer ?? null,
    category: s.metadata.category,
    difficulty: s.metadata.difficulty,
    domains: s.metadata.domains,
  },
}));

// ---------------------------------------------------------------------------
// Eval suite
// ---------------------------------------------------------------------------

ls.describe("usopc-quality-review", () => {
  for (const example of examples) {
    const scenarioId = String(example.inputs.scenarioId);

    ls.test(
      scenarioId,
      {
        inputs: example.inputs,
        referenceOutputs: example.referenceOutputs,
      },
      async ({ inputs, referenceOutputs }) => {
        const messages = inputs.messages as Array<{
          role: "user" | "assistant";
          content: string;
        }>;
        const userSport = inputs.userSport as string | undefined;

        // Find original scenario for multi-turn detection
        const scenario = qualityReviewScenarios.find(
          (s) => s.id === scenarioId,
        )!;
        const multiTurn = isMultiTurn(scenario);

        const result = multiTurn
          ? await runMultiTurnPipeline(messages, {
              userSport: userSport ?? undefined,
            })
          : await runPipeline(messages[0]!.content);

        const answer = result.state.answer ?? "";
        const trajectory = result.trajectory;

        ls.logOutputs({
          answer,
          trajectory,
          category: referenceOutputs?.category,
          difficulty: referenceOutputs?.difficulty,
        });

        // -- Deterministic feedback --

        // 1. Did the scenario complete without error?
        ls.logFeedback({ key: "qr_completed", score: 1.0 });

        // 2. Did the agent produce a non-empty answer?
        ls.logFeedback({
          key: "qr_has_answer",
          score: answer.trim().length > 0 ? 1.0 : 0.0,
        });

        // 3. Trajectory match (when expected path is provided)
        const expectedPath = referenceOutputs?.expected_path;
        if (typeof expectedPath === "string" && expectedPath.length > 0) {
          const expectedNodes = expectedPath
            .split("→")
            .map((s: string) => s.trim());
          // Subset match — did the actual trajectory contain all expected nodes in order?
          let idx = 0;
          for (const node of trajectory) {
            if (idx < expectedNodes.length && node === expectedNodes[idx]) {
              idx++;
            }
          }
          ls.logFeedback({
            key: "qr_trajectory_match",
            score: idx === expectedNodes.length ? 1.0 : 0.0,
          });
        }
      },
      300_000,
    );
  }
});
