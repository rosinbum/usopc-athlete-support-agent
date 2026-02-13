#!/usr/bin/env tsx

/**
 * Creates or configures a LangSmith Annotation Queue for the quality review
 * project. After running scenarios with `quality:run`, reviewers open this
 * annotation queue in the LangSmith UI to annotate traces.
 *
 * Usage: pnpm --filter @usopc/evals quality:setup
 */

import { resolveEnv } from "../helpers/resolveEnv.js";

// Bridge SST Resource bindings → env vars before any SDK is loaded
resolveEnv();

import { getLangSmithClient, QUALITY_REVIEW_PROJECT } from "../config.js";
import {
  FEEDBACK_KEYS,
  SCORING_RUBRIC,
  FAILURE_MODES,
} from "../quality-review/taxonomy.js";

const QUEUE_NAME = "quality-review";

async function main(): Promise<void> {
  const client = getLangSmithClient();

  // ------------------------------------------------------------------
  // 1. Check if annotation queue already exists
  // ------------------------------------------------------------------
  let existingQueueId: string | undefined;
  for await (const queue of client.listAnnotationQueues({
    name: QUEUE_NAME,
  })) {
    if (queue.name === QUEUE_NAME) {
      existingQueueId = queue.id;
      break;
    }
  }

  if (existingQueueId) {
    console.log(
      `  ✓ Annotation queue "${QUEUE_NAME}" already exists (${existingQueueId})`,
    );
  } else {
    // Build rubric instructions for the annotation queue
    const rubricLines: string[] = [
      "# Quality Review Scoring Rubric",
      "",
      "## Scoring Dimensions",
      "",
    ];

    for (const dim of SCORING_RUBRIC) {
      rubricLines.push(`### ${dim.name} (${dim.key})`);
      for (const level of dim.levels) {
        rubricLines.push(
          `- **${level.score} — ${level.label}**: ${level.description}`,
        );
      }
      rubricLines.push("");
    }

    rubricLines.push("## Failure Mode Codes");
    rubricLines.push("");
    rubricLines.push(
      `Record failure modes as comma-separated codes in the \`${FEEDBACK_KEYS.failureModes}\` field.`,
    );
    rubricLines.push("");
    rubricLines.push("| Code | Label | Node | Severity |");
    rubricLines.push("|------|-------|------|----------|");
    for (const fm of Object.values(FAILURE_MODES)) {
      rubricLines.push(
        `| ${fm.code} | ${fm.label} | ${fm.node} | ${fm.severity} |`,
      );
    }

    const queue = await client.createAnnotationQueue({
      name: QUEUE_NAME,
      description: `Human-in-the-loop quality review for the ${QUALITY_REVIEW_PROJECT} project. Annotators score traces on quality, helpfulness, accuracy, completeness, and tone (1–5), tag failure modes, and leave notes.`,
      rubricInstructions: rubricLines.join("\n"),
    });

    console.log(`  ✓ Created annotation queue "${QUEUE_NAME}" (${queue.id})`);
    existingQueueId = queue.id;
  }

  // ------------------------------------------------------------------
  // 2. Add recent runs from the quality review project to the queue
  // ------------------------------------------------------------------
  console.log();
  console.log(
    `  Looking for runs in project "${QUALITY_REVIEW_PROJECT}" to add to queue...`,
  );

  // Find the project by name
  let projectId: string | undefined;
  for await (const project of client.listProjects()) {
    if (project.name === QUALITY_REVIEW_PROJECT) {
      projectId = project.id;
      break;
    }
  }

  if (!projectId) {
    console.log(
      `  ⚠ Project "${QUALITY_REVIEW_PROJECT}" not found. Run quality:run first to create traces.`,
    );
    console.log();
    console.log("Setup complete. Annotation queue is ready.");
    return;
  }

  // List root runs that haven't been annotated yet
  const runIds: string[] = [];
  for await (const run of client.listRuns({
    projectId,
    isRoot: true,
  })) {
    runIds.push(run.id);
  }

  if (runIds.length === 0) {
    console.log(
      `  ⚠ No runs found in project "${QUALITY_REVIEW_PROJECT}". Run quality:run first.`,
    );
  } else {
    await client.addRunsToAnnotationQueue(existingQueueId, runIds);
    console.log(`  ✓ Added ${runIds.length} runs to annotation queue`);
  }

  console.log();
  console.log("Setup complete.");
  console.log(
    "Open LangSmith → Annotation Queues → quality-review to start reviewing.",
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
