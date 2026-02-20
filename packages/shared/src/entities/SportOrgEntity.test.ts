import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

// Create mock model methods
const mockCreate = vi.fn();
const mockGet = vi.fn();
const mockFind = vi.fn();
const mockScan = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();

const mockModel = {
  create: mockCreate,
  get: mockGet,
  find: mockFind,
  scan: mockScan,
  update: mockUpdate,
  remove: mockRemove,
};

// Mock Table that returns our mock model
const mockTable = {
  getModel: vi.fn(() => mockModel),
} as unknown;

// Import after mocks
import { SportOrgEntity, type SportOrganization } from "./SportOrgEntity.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A sample SportOrganization as returned by the public API (external shape). */
const SAMPLE_ORG: SportOrganization = {
  id: "usa-swimming",
  type: "ngb",
  officialName: "USA Swimming",
  abbreviation: "USAS",
  sports: ["Swimming", "Open Water Swimming"],
  olympicProgram: "summer",
  paralympicManaged: false,
  websiteUrl: "https://www.usaswimming.org",
  bylawsUrl: "https://www.usaswimming.org/bylaws",
  selectionProceduresUrl: "https://www.usaswimming.org/selection",
  internationalFederation: "World Aquatics",
  aliases: ["US Swimming", "USA-S"],
  keywords: ["pool", "freestyle", "backstroke"],
  status: "active",
  effectiveDate: "2024-01-01",
};

/** Returns the OneTable-internal representation (no nulls, undefined for absent). */
function internalItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "usa-swimming",
    type: "ngb",
    officialName: "USA Swimming",
    abbreviation: "USAS",
    sports: ["Swimming", "Open Water Swimming"],
    olympicProgram: "summer",
    paralympicManaged: false,
    websiteUrl: "https://www.usaswimming.org",
    bylawsUrl: "https://www.usaswimming.org/bylaws",
    selectionProceduresUrl: "https://www.usaswimming.org/selection",
    internationalFederation: "World Aquatics",
    aliases: ["US Swimming", "USA-S"],
    keywords: ["pool", "freestyle", "backstroke"],
    status: "active",
    effectiveDate: "2024-01-01",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SportOrgEntity", () => {
  let entity: SportOrgEntity;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
    entity = new SportOrgEntity(mockTable as never);
  });

  describe("create", () => {
    it("calls model.create with internal representation and returns external shape", async () => {
      mockCreate.mockResolvedValueOnce(
        internalItem({
          createdAt: "2024-01-15T12:00:00.000Z",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );

      const result = await entity.create(SAMPLE_ORG);

      // Verify model.create was called with the internal representation
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "usa-swimming",
          type: "ngb",
          officialName: "USA Swimming",
          createdAt: "2024-01-15T12:00:00.000Z",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
        { exists: null },
      );

      // Return value should be in external shape
      expect(result.id).toBe("usa-swimming");
      expect(result.officialName).toBe("USA Swimming");
      expect(result.type).toBe("ngb");
    });

    it("strips null olympicProgram from internal representation", async () => {
      const orgWithNullProgram: SportOrganization = {
        ...SAMPLE_ORG,
        olympicProgram: null,
      };

      mockCreate.mockResolvedValueOnce(internalItem());

      await entity.create(orgWithNullProgram);

      // Null fields should be stripped from the internal call
      const createArg = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(createArg.olympicProgram).toBeUndefined();
    });
  });

  describe("getById", () => {
    it("returns null for missing item", async () => {
      mockGet.mockResolvedValueOnce(undefined);

      const result = await entity.getById("nonexistent");

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith({ id: "nonexistent" });
    });

    it("converts internal item to external shape", async () => {
      mockGet.mockResolvedValueOnce(internalItem());

      const result = await entity.getById("usa-swimming");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("usa-swimming");
      expect(result!.officialName).toBe("USA Swimming");
      expect(result!.type).toBe("ngb");
      expect(result!.sports).toEqual(["Swimming", "Open Water Swimming"]);
      expect(result!.olympicProgram).toBe("summer");
      expect(result!.status).toBe("active");
    });

    it("converts undefined olympicProgram to null", async () => {
      mockGet.mockResolvedValueOnce(
        internalItem({ olympicProgram: undefined }),
      );

      const result = await entity.getById("usa-swimming");

      expect(result!.olympicProgram).toBeNull();
    });

    it("defaults missing arrays to empty arrays", async () => {
      mockGet.mockResolvedValueOnce(
        internalItem({
          sports: undefined,
          aliases: undefined,
          keywords: undefined,
        }),
      );

      const result = await entity.getById("usa-swimming");

      expect(result!.sports).toEqual([]);
      expect(result!.aliases).toEqual([]);
      expect(result!.keywords).toEqual([]);
    });
  });

  describe("getAll", () => {
    it("returns all organizations via model.scan", async () => {
      mockScan.mockResolvedValueOnce([
        internalItem({ id: "usa-swimming" }),
        internalItem({ id: "usatf", officialName: "USA Track & Field" }),
      ]);

      const results = await entity.getAll();

      expect(results).toHaveLength(2);
      expect(results[0]!.id).toBe("usa-swimming");
      expect(results[1]!.id).toBe("usatf");
    });

    it("returns empty array when no organizations exist", async () => {
      mockScan.mockResolvedValueOnce([]);

      const results = await entity.getAll();

      expect(results).toEqual([]);
    });
  });

  describe("search", () => {
    const allOrgs = [
      internalItem({ id: "usa-swimming" }),
      internalItem({
        id: "usatf",
        officialName: "USA Track & Field",
        abbreviation: "USATF",
        sports: ["Track and Field", "Cross Country"],
        aliases: ["US Track"],
        keywords: ["running", "marathon"],
      }),
      internalItem({
        id: "usss",
        officialName: "US Ski & Snowboard",
        abbreviation: "USSS",
        sports: ["Alpine Skiing", "Snowboarding"],
        aliases: ["USSA"],
        keywords: ["ski", "snow"],
      }),
    ];

    it("matches by officialName", async () => {
      mockScan.mockResolvedValueOnce(allOrgs);

      const results = await entity.search("Swimming");

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("usa-swimming");
    });

    it("matches by abbreviation", async () => {
      mockScan.mockResolvedValueOnce(allOrgs);

      const results = await entity.search("USATF");

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("usatf");
    });

    it("matches by sport name", async () => {
      mockScan.mockResolvedValueOnce(allOrgs);

      const results = await entity.search("Snowboarding");

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("usss");
    });

    it("matches by alias", async () => {
      mockScan.mockResolvedValueOnce(allOrgs);

      const results = await entity.search("US Track");

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("usatf");
    });

    it("matches by keyword", async () => {
      mockScan.mockResolvedValueOnce(allOrgs);

      const results = await entity.search("marathon");

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("usatf");
    });

    it("is case-insensitive", async () => {
      mockScan.mockResolvedValueOnce(allOrgs);

      const results = await entity.search("swimming");

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("usa-swimming");
    });

    it("returns empty array when nothing matches", async () => {
      mockScan.mockResolvedValueOnce(allOrgs);

      const results = await entity.search("Nonexistent");

      expect(results).toEqual([]);
    });
  });

  describe("update", () => {
    it("merges updates and sets updatedAt", async () => {
      mockUpdate.mockResolvedValueOnce(
        internalItem({
          officialName: "USA Swimming Inc.",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );

      const result = await entity.update("usa-swimming", {
        officialName: "USA Swimming Inc.",
      });

      expect(result.officialName).toBe("USA Swimming Inc.");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "usa-swimming",
          officialName: "USA Swimming Inc.",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      );
    });

    it("strips null values in updates", async () => {
      mockUpdate.mockResolvedValueOnce(internalItem());

      await entity.update("usa-swimming", {
        olympicProgram: null,
      });

      const updateArg = mockUpdate.mock.calls[0]![0] as Record<string, unknown>;
      expect(updateArg.olympicProgram).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("removes the item from the table", async () => {
      mockRemove.mockResolvedValueOnce(undefined);

      await entity.delete("usa-swimming");

      expect(mockRemove).toHaveBeenCalledWith({ id: "usa-swimming" });
    });
  });
});
