import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.eval.ts"],
    reporters: ["langsmith/vitest/reporter"],
    setupFiles: ["src/setup-eval.ts"],
    testTimeout: 120_000,
  },
});
