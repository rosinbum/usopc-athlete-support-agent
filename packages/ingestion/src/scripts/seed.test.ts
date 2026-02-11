import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
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

vi.mock("./seed-db.js", () => ({
  initDatabase: vi.fn(async () => {}),
  loadAllSources: vi.fn(async () => []),
  repoRoot: vi.fn(() => "/fake/root"),
}));

vi.mock("./seed-dynamodb.js", () => ({
  seedSourceConfigs: vi.fn(async () => {}),
  seedSportOrgs: vi.fn(async () => {}),
}));

vi.mock("../pipeline.js", () => ({
  ingestSource: vi.fn(async () => ({
    sourceId: "test",
    status: "completed",
    chunksCount: 0,
  })),
}));

vi.mock("../db.js", () => ({
  upsertIngestionStatus: vi.fn(async () => {}),
}));

vi.mock("../entities/index.js", () => ({
  createIngestionLogEntity: vi.fn(() => ({})),
  createSourceConfigEntity: vi.fn(() => ({
    markSuccess: vi.fn(async () => {}),
    markFailure: vi.fn(async () => {}),
  })),
}));

vi.mock("../loaders/fetchWithRetry.js", () => ({
  fetchWithRetry: vi.fn(async () => ({
    text: async () => "mock content",
  })),
}));

// Import after mocks
import { parseArgs } from "./seed.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("defaults to all flags false when no args", () => {
    const result = parseArgs([]);
    expect(result.skipIngest).toBe(false);
    expect(result.force).toBe(false);
    expect(result.dryRun).toBe(false);
  });

  it("parses --skip-ingest", () => {
    const result = parseArgs(["--skip-ingest"]);
    expect(result.skipIngest).toBe(true);
    expect(result.force).toBe(false);
    expect(result.dryRun).toBe(false);
  });

  it("parses --force", () => {
    const result = parseArgs(["--force"]);
    expect(result.force).toBe(true);
    expect(result.skipIngest).toBe(false);
    expect(result.dryRun).toBe(false);
  });

  it("parses --dry-run", () => {
    const result = parseArgs(["--dry-run"]);
    expect(result.dryRun).toBe(true);
    expect(result.force).toBe(false);
    expect(result.skipIngest).toBe(false);
  });

  it("parses multiple flags together", () => {
    const result = parseArgs(["--skip-ingest", "--force"]);
    expect(result.skipIngest).toBe(true);
    expect(result.force).toBe(true);
    expect(result.dryRun).toBe(false);
  });

  it("parses all flags together", () => {
    const result = parseArgs(["--dry-run", "--force", "--skip-ingest"]);
    expect(result.skipIngest).toBe(true);
    expect(result.force).toBe(true);
    expect(result.dryRun).toBe(true);
  });

  it("ignores unknown flags", () => {
    const result = parseArgs(["--unknown", "--skip-ingest"]);
    expect(result.skipIngest).toBe(true);
    expect(result.force).toBe(false);
    expect(result.dryRun).toBe(false);
  });
});
