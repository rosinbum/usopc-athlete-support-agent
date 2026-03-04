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

vi.mock("sst", () => ({
  Resource: {
    DocumentsBucket: { name: "test-bucket" },
  },
}));

vi.mock("../cron.js", () => ({
  toIngestionSource: vi.fn((c: unknown) => c),
}));

vi.mock("../pipeline.js", () => ({
  ingestSource: vi.fn(),
  ingestAll: vi.fn(async () => []),
}));

vi.mock("../loaders/fetchWithRetry.js", () => ({
  fetchWithRetry: vi.fn(),
  FetchWithRetryError: class extends Error {
    constructor(
      message: string,
      public url: string,
      public attempts: number,
      public statusCode?: number,
    ) {
      super(message);
      this.name = "FetchWithRetryError";
    }
  },
}));

vi.mock("../services/sourceProcessor.js", () => ({
  processSource: vi.fn(async () => ({
    status: "completed",
    chunksCount: 0,
  })),
}));

vi.mock("../entities/index.js", () => ({
  createSourceConfigEntity: vi.fn(() => ({
    getAllEnabled: vi.fn(async () => []),
    getById: vi.fn(),
    markSuccess: vi.fn(),
    markFailure: vi.fn(),
  })),
  createIngestionLogEntity: vi.fn(() => ({})),
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
