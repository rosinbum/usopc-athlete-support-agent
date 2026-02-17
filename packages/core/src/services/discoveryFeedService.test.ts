import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    logger: {
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
    createAppTable: vi.fn(),
    DiscoveredSourceEntity: vi.fn(),
  };
});

import { createAppTable, DiscoveredSourceEntity } from "@usopc/shared";
import { persistDiscoveredUrls, normalizeUrl } from "./discoveryFeedService.js";
import type { WebSearchResult } from "../types/index.js";

const mockCreateAppTable = vi.mocked(createAppTable);
const MockDiscoveredSourceEntity = vi.mocked(DiscoveredSourceEntity);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockEntity() {
  return {
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    // Other methods not used by this service
    getAll: vi.fn(),
    getByStatus: vi.fn(),
    getApprovedSince: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    markMetadataEvaluated: vi.fn(),
    markContentEvaluated: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    linkToSourceConfig: vi.fn(),
  };
}

function makeResults(
  ...entries: (string | { url: string; score: number })[]
): WebSearchResult[] {
  return entries.map((entry, i) => {
    const url = typeof entry === "string" ? entry : entry.url;
    const score = typeof entry === "string" ? 0.8 : entry.score;
    return {
      url,
      title: `Title ${i}`,
      content: `Content ${i}`,
      score,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("normalizeUrl", () => {
  it("strips fragment", () => {
    expect(normalizeUrl("https://usopc.org/page#section")).toBe(
      "https://usopc.org/page",
    );
  });

  it("strips trailing slash on paths", () => {
    expect(normalizeUrl("https://usopc.org/page/")).toBe(
      "https://usopc.org/page",
    );
  });

  it("preserves root path trailing slash", () => {
    expect(normalizeUrl("https://usopc.org/")).toBe("https://usopc.org/");
  });

  it("strips www. prefix", () => {
    expect(normalizeUrl("https://www.usopc.org/page")).toBe(
      "https://usopc.org/page",
    );
  });

  it("handles all normalizations together", () => {
    expect(normalizeUrl("https://www.usopc.org/page/#section")).toBe(
      "https://usopc.org/page",
    );
  });

  it("returns invalid URLs as-is", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("persistDiscoveredUrls", () => {
  let mockEntity: ReturnType<typeof makeMockEntity>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEntity = makeMockEntity();
    mockCreateAppTable.mockReturnValue({} as ReturnType<typeof createAppTable>);
    MockDiscoveredSourceEntity.mockReturnValue(
      mockEntity as unknown as InstanceType<typeof DiscoveredSourceEntity>,
    );
  });

  it("returns early for empty input", async () => {
    const result = await persistDiscoveredUrls([], "test-table");

    expect(result).toEqual({ persisted: 0, skipped: 0 });
    expect(mockCreateAppTable).not.toHaveBeenCalled();
  });

  it("persists all URLs and calls markMetadataEvaluated", async () => {
    const results = makeResults(
      "https://usopc.org/doc1",
      "https://teamusa.org/doc2",
    );

    const output = await persistDiscoveredUrls(results, "test-table");

    expect(output).toEqual({ persisted: 2, skipped: 0 });
    expect(mockEntity.create).toHaveBeenCalledTimes(2);
    expect(mockEntity.markMetadataEvaluated).toHaveBeenCalledTimes(2);
  });

  it("creates entries with correct fields", async () => {
    const results = makeResults("https://usopc.org/selection-procedures");

    await persistDiscoveredUrls(results, "test-table");

    expect(mockEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://usopc.org/selection-procedures",
        title: "Title 0",
        discoveryMethod: "agent",
        discoveredFrom: "agent-web-search",
      }),
    );
  });

  it("skips existing URLs via conditional put failure (dedup)", async () => {
    mockEntity.create.mockRejectedValueOnce(
      new Error("Conditional check failed"),
    );
    const results = makeResults("https://usopc.org/existing-doc");

    const output = await persistDiscoveredUrls(results, "test-table");

    expect(output).toEqual({ persisted: 0, skipped: 1 });
    expect(mockEntity.markMetadataEvaluated).not.toHaveBeenCalled();
  });

  it("individual URL errors don't block others", async () => {
    mockEntity.create
      .mockRejectedValueOnce(new Error("DynamoDB error"))
      .mockResolvedValueOnce({});
    const results = makeResults(
      "https://usopc.org/failing",
      "https://usopc.org/succeeding",
    );

    const output = await persistDiscoveredUrls(results, "test-table");

    expect(output).toEqual({ persisted: 1, skipped: 0 });
  });

  it("normalizes URLs before generating IDs", async () => {
    const results = makeResults("https://www.usopc.org/page/#section");

    await persistDiscoveredUrls(results, "test-table");

    expect(mockEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://usopc.org/page",
      }),
    );
  });

  it("calls markMetadataEvaluated with Tavily score and reasoning", async () => {
    const results = makeResults({
      url: "https://usopc.org/doc1",
      score: 0.73,
    });

    await persistDiscoveredUrls(results, "test-table");

    expect(mockEntity.markMetadataEvaluated).toHaveBeenCalledWith(
      expect.any(String),
      0.73,
      "Auto-scored from Tavily relevance (agent web search)",
      [],
      "",
    );
  });

  it("passes high Tavily score (>= 0.5) to markMetadataEvaluated", async () => {
    const results = makeResults({
      url: "https://usopc.org/high-score",
      score: 0.85,
    });

    await persistDiscoveredUrls(results, "test-table");

    // markMetadataEvaluated handles status: >= 0.5 → pending_content
    expect(mockEntity.markMetadataEvaluated).toHaveBeenCalledWith(
      expect.any(String),
      0.85,
      expect.any(String),
      [],
      "",
    );
  });

  it("passes low Tavily score (< 0.5) to markMetadataEvaluated", async () => {
    const results = makeResults({
      url: "https://usopc.org/low-score",
      score: 0.3,
    });

    await persistDiscoveredUrls(results, "test-table");

    // markMetadataEvaluated handles status: < 0.5 → rejected
    expect(mockEntity.markMetadataEvaluated).toHaveBeenCalledWith(
      expect.any(String),
      0.3,
      expect.any(String),
      [],
      "",
    );
  });

  it("generates deterministic IDs from normalized URLs", async () => {
    // Same URL with different fragments should produce the same ID
    const results1 = makeResults("https://usopc.org/doc#a");
    const results2 = makeResults("https://usopc.org/doc#b");

    await persistDiscoveredUrls(results1, "test-table");
    const id1 = mockEntity.create.mock.calls[0][0].id;

    vi.clearAllMocks();
    mockEntity = makeMockEntity();
    MockDiscoveredSourceEntity.mockReturnValue(
      mockEntity as unknown as InstanceType<typeof DiscoveredSourceEntity>,
    );

    await persistDiscoveredUrls(results2, "test-table");
    const id2 = mockEntity.create.mock.calls[0][0].id;

    expect(id1).toBe(id2);
  });
});
