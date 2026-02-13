import { defineConfig } from "vitest/config";

// The langsmith/vitest reporter only records experiments when tracing is
// enabled.  Set this before the reporter initialises (config module runs
// first, then reporters, then setupFiles).
process.env.LANGSMITH_TRACING = "true";

export default defineConfig({
  test: {
    include: ["src/**/*.eval.ts"],
    reporters: ["langsmith/vitest/reporter"],
    setupFiles: ["src/setup-eval.ts"],
    testTimeout: 120_000,
  },
});
