#!/usr/bin/env tsx

import { resolveEnv } from "../helpers/resolveEnv.js";

// Bridge SST Resource bindings → env vars before any SDK is loaded
resolveEnv();

import { SUITE_NAMES, type SuiteName } from "../config.js";

/** Maps suite CLI names to their evaluator module file names. */
const SUITE_MODULE_MAP: Record<SuiteName, string> = {
  classifier: "classifierAccuracy",
  groundedness: "groundedness",
  correctness: "correctness",
  escalation: "escalation",
  trajectory: "trajectory",
  citations: "citations",
  disclaimers: "disclaimers",
};

function printUsage(): void {
  console.log(`
Usage: pnpm --filter @usopc/evals eval [options]

Options:
  --suite <name>   Run a specific evaluation suite
  --list           List available suites
  --help           Show this help message

Available suites:
${SUITE_NAMES.map((s) => `  - ${s}`).join("\n")}

Examples:
  pnpm --filter @usopc/evals eval                    # Run all suites
  pnpm --filter @usopc/evals eval --suite classifier  # Run single suite
`);
}

function parseArgs(argv: string[]): {
  suite?: SuiteName;
  list: boolean;
  help: boolean;
} {
  const args = argv.slice(2).filter((a) => a !== "--");
  let suite: SuiteName | undefined;
  let list = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--suite":
        i++;
        if (!args[i]) {
          console.error("Error: --suite requires a value");
          process.exit(1);
        }
        if (!SUITE_NAMES.includes(args[i] as SuiteName)) {
          console.error(`Error: Unknown suite "${args[i]}"`);
          console.error(`Available suites: ${SUITE_NAMES.join(", ")}`);
          process.exit(1);
        }
        suite = args[i] as SuiteName;
        break;
      case "--list":
        list = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        console.error(`Error: Unknown argument "${args[i]}"`);
        printUsage();
        process.exit(1);
    }
  }

  return { suite, list, help };
}

async function runSuite(name: SuiteName): Promise<void> {
  console.log(`\n--- Running eval suite: ${name} ---\n`);

  try {
    // Dynamic import of the evaluator module
    const moduleName = SUITE_MODULE_MAP[name];
    const mod = await import(`../evaluators/${moduleName}.js`);
    if (typeof mod.run !== "function") {
      console.error(`Suite "${name}" does not export a run() function`);
      process.exit(1);
    }
    await mod.run();
    console.log(`\n--- Suite "${name}" complete ---\n`);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND"
    ) {
      console.log(`Suite "${name}" not yet implemented — skipping.`);
      return;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const { suite, list, help } = parseArgs(process.argv);

  if (help) {
    printUsage();
    return;
  }

  if (list) {
    console.log("Available evaluation suites:");
    for (const name of SUITE_NAMES) {
      console.log(`  - ${name}`);
    }
    return;
  }

  if (suite) {
    await runSuite(suite);
  } else {
    console.log("Running all evaluation suites...\n");
    for (const name of SUITE_NAMES) {
      await runSuite(name);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
