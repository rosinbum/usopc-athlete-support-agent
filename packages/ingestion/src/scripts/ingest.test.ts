import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — the module calls main() at import time, so we must mock everything
// ---------------------------------------------------------------------------

vi.mock("@usopc/shared", () => ({
  getDatabaseUrl: () => "postgresql://localhost/test",
  getSecretValue: () => "sk-test",
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
  isProduction: () => false,
}));

vi.mock("../cron.js", () => ({
  loadSourceConfigs: vi.fn(async () => ({ sources: [], entity: undefined })),
}));

vi.mock("../pipeline.js", () => ({
  ingestSource: vi.fn(),
  ingestAll: vi.fn(async () => []),
}));

vi.mock("../loaders/fetchWithRetry.js", () => ({
  fetchWithRetry: vi.fn(),
}));

// Import after mocks
import { parseArgs } from "./ingest.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("returns resume=true for --resume flag", () => {
    const result = parseArgs(["--resume"]);
    expect(result.resume).toBe(true);
    expect(result.force).toBe(false);
    expect(result.all).toBe(true);
  });

  it("returns force=true and resume=false for --force flag", () => {
    const result = parseArgs(["--force"]);
    expect(result.force).toBe(true);
    expect(result.resume).toBe(false);
    expect(result.all).toBe(true);
  });

  it("defaults to all=true and resume=true when no flags", () => {
    const result = parseArgs([]);
    expect(result.all).toBe(true);
    expect(result.resume).toBe(true);
    expect(result.force).toBe(false);
    expect(result.sourceId).toBeUndefined();
  });

  it("--force overrides --resume even when both provided", () => {
    const result = parseArgs(["--resume", "--force"]);
    expect(result.force).toBe(true);
    expect(result.resume).toBe(false);
  });

  it("parses --source flag with id", () => {
    const result = parseArgs(["--source", "my-source-id"]);
    expect(result.sourceId).toBe("my-source-id");
    expect(result.all).toBe(false);
  });

  it("--all without --force defaults to resume=true", () => {
    const result = parseArgs(["--all"]);
    expect(result.all).toBe(true);
    expect(result.resume).toBe(true);
    expect(result.force).toBe(false);
  });

  it("--all --force disables resume", () => {
    const result = parseArgs(["--all", "--force"]);
    expect(result.all).toBe(true);
    expect(result.force).toBe(true);
    expect(result.resume).toBe(false);
  });
});
