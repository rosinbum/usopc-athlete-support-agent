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

function makeResults(...urls: string[]): WebSearchResult[] {
  return urls.map((url, i) => ({
    url,
    title: `Title ${i}`,
    content: `Content ${i}`,
  }));
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

  it("persists all URLs", async () => {
    const results = makeResults(
      "https://usopc.org/doc1",
      "https://teamusa.org/doc2",
    );

    const output = await persistDiscoveredUrls(results, "test-table");

    expect(output).toEqual({ persisted: 2, skipped: 0 });
    expect(mockEntity.create).toHaveBeenCalledTimes(2);
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

  it("skips existing URLs (dedup)", async () => {
    mockEntity.getById.mockResolvedValueOnce({ id: "existing" });
    const results = makeResults("https://usopc.org/existing-doc");

    const output = await persistDiscoveredUrls(results, "test-table");

    expect(output).toEqual({ persisted: 0, skipped: 1 });
    expect(mockEntity.create).not.toHaveBeenCalled();
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
