import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/sources.js", () => ({
  listUniqueDocuments: vi.fn(),
  getSourcesStats: vi.fn(),
}));

vi.mock("../db/client.js", () => ({
  getPool: vi.fn(() => ({})),
}));

// Import after mocking
import { sourcesRouter } from "./sources.js";
import { createContext } from "../trpc.js";
import { listUniqueDocuments, getSourcesStats } from "../db/sources.js";

const mockListUniqueDocuments = vi.mocked(listUniqueDocuments);
const mockGetSourcesStats = vi.mocked(getSourcesStats);

// Create a caller for testing
const createCaller = () => {
  const ctx = createContext();
  return sourcesRouter.createCaller(ctx);
};

describe("sourcesRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns empty array when no documents", async () => {
      mockListUniqueDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      const caller = createCaller();
      const result = await caller.list();

      expect(result.documents).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("returns documents with correct shape", async () => {
      const mockDoc = {
        sourceUrl: "https://example.com/doc.pdf",
        documentTitle: "Test Doc",
        documentType: "policy",
        ngbId: "usa_swimming",
        topicDomain: "team_selection",
        authorityLevel: "ngb_policy_procedure",
        effectiveDate: "2024-01-01",
        ingestedAt: "2024-06-15T10:00:00.000Z",
        chunkCount: 10,
      };

      mockListUniqueDocuments.mockResolvedValueOnce({
        documents: [mockDoc],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const caller = createCaller();
      const result = await caller.list();

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]).toEqual(mockDoc);
    });

    it("applies filters from input", async () => {
      mockListUniqueDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      const caller = createCaller();
      await caller.list({
        search: "bylaws",
        documentType: "policy",
        topicDomain: "safesport",
        ngbId: "usa_swimming",
        authorityLevel: "ngb_policy_procedure",
        page: 2,
        limit: 10,
      });

      expect(mockListUniqueDocuments).toHaveBeenCalledWith(expect.anything(), {
        search: "bylaws",
        documentType: "policy",
        topicDomain: "safesport",
        ngbId: "usa_swimming",
        authorityLevel: "ngb_policy_procedure",
        page: 2,
        limit: 10,
      });
    });

    it("pagination works correctly", async () => {
      mockListUniqueDocuments.mockResolvedValueOnce({
        documents: [],
        total: 50,
        page: 3,
        limit: 10,
        totalPages: 5,
      });

      const caller = createCaller();
      const result = await caller.list({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(50);
      expect(result.totalPages).toBe(5);
    });

    it("uses default pagination values when not specified", async () => {
      mockListUniqueDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      const caller = createCaller();
      await caller.list();

      expect(mockListUniqueDocuments).toHaveBeenCalledWith(expect.anything(), {
        page: 1,
        limit: 20,
      });
    });
  });

  describe("getStats", () => {
    it("returns aggregated statistics", async () => {
      mockGetSourcesStats.mockResolvedValueOnce({
        totalDocuments: 42,
        totalOrganizations: 15,
        lastIngestedAt: "2024-06-15T10:00:00.000Z",
      });

      const caller = createCaller();
      const result = await caller.getStats();

      expect(result).toEqual({
        totalDocuments: 42,
        totalOrganizations: 15,
        lastIngestedAt: "2024-06-15T10:00:00.000Z",
      });
    });

    it("returns null lastIngestedAt when no documents", async () => {
      mockGetSourcesStats.mockResolvedValueOnce({
        totalDocuments: 0,
        totalOrganizations: 0,
        lastIngestedAt: null,
      });

      const caller = createCaller();
      const result = await caller.getStats();

      expect(result.lastIngestedAt).toBeNull();
    });
  });
});
