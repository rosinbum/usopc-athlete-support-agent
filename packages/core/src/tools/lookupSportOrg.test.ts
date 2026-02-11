import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SportOrganization } from "../types/index.js";

const mockOrganizations: SportOrganization[] = [
  {
    id: "usa-swimming",
    officialName: "USA Swimming",
    abbreviation: "USAS",
    type: "ngb",
    sports: ["Swimming", "Open Water Swimming"],
    olympicProgram: "summer",
    paralympicManaged: false,
    websiteUrl: "https://www.usaswimming.org",
    bylawsUrl: "https://www.usaswimming.org/bylaws",
    selectionProceduresUrl: "https://www.usaswimming.org/selection",
    internationalFederation: "World Aquatics",
    status: "active",
    effectiveDate: "2024-01-01",
    aliases: ["US Swimming", "USA-S"],
    keywords: ["pool", "freestyle", "backstroke"],
  },
  {
    id: "usatf",
    officialName: "USA Track & Field",
    abbreviation: "USATF",
    type: "ngb",
    sports: ["Track and Field", "Cross Country", "Race Walking"],
    olympicProgram: "summer",
    paralympicManaged: false,
    websiteUrl: "https://www.usatf.org",
    bylawsUrl: undefined,
    selectionProceduresUrl: undefined,
    internationalFederation: "World Athletics",
    status: "active",
    effectiveDate: "2024-01-01",
    aliases: ["USATF", "US Track"],
    keywords: ["running", "sprinting", "marathon"],
  },
  {
    id: "usss",
    officialName: "US Ski & Snowboard",
    abbreviation: "USSS",
    type: "ngb",
    sports: ["Alpine Skiing", "Freestyle Skiing", "Snowboarding"],
    olympicProgram: "winter",
    paralympicManaged: true,
    websiteUrl: "https://usskiandsnowboard.org",
    bylawsUrl: undefined,
    selectionProceduresUrl: undefined,
    internationalFederation: "FIS",
    status: "active",
    effectiveDate: "2024-01-01",
    aliases: ["USSA"],
    keywords: ["ski", "snow", "alpine"],
  },
];

const mockGetAll = vi.fn().mockResolvedValue(mockOrganizations);

const mockEntity = {
  getAll: mockGetAll,
  getById: vi.fn(),
  search: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

import { createLookupSportOrgTool } from "./lookupSportOrg.js";

describe("createLookupSportOrgTool", () => {
  let tool: ReturnType<typeof createLookupSportOrgTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue(mockOrganizations);
    tool = createLookupSportOrgTool(mockEntity as never);
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("lookup_sport_org");
    });

    it("should have a description", () => {
      expect(tool.description).toContain("National Governing Body");
      expect(tool.description).toContain("NGB");
    });
  });

  describe("exact abbreviation match", () => {
    it("should find organization by exact abbreviation", async () => {
      const result = await tool.invoke({ query: "USAS" });
      expect(result).toContain("USA Swimming");
      expect(result).toContain("Abbreviation: USAS");
    });

    it("should be case-insensitive", async () => {
      const result = await tool.invoke({ query: "usatf" });
      expect(result).toContain("USA Track & Field");
    });
  });

  describe("official name match", () => {
    it("should find organization by exact official name", async () => {
      const result = await tool.invoke({ query: "USA Swimming" });
      expect(result).toContain("USA Swimming");
      expect(result).toContain("Type: National Governing Body");
    });

    it("should find organization by partial name", async () => {
      const result = await tool.invoke({ query: "Track & Field" });
      expect(result).toContain("USA Track & Field");
    });
  });

  describe("sport name match", () => {
    it("should find organization by sport name", async () => {
      const result = await tool.invoke({ query: "Swimming" });
      expect(result).toContain("USA Swimming");
    });

    it("should find organization by related sport", async () => {
      const result = await tool.invoke({ query: "Snowboarding" });
      expect(result).toContain("US Ski & Snowboard");
    });
  });

  describe("alias match", () => {
    it("should find organization by alias", async () => {
      const result = await tool.invoke({ query: "US Swimming" });
      expect(result).toContain("USA Swimming");
    });

    it("should include alias information in result", async () => {
      const result = await tool.invoke({ query: "USAS" });
      expect(result).toContain("Also known as:");
    });
  });

  describe("keyword match", () => {
    it("should find organization by keyword", async () => {
      const result = await tool.invoke({ query: "marathon" });
      expect(result).toContain("USA Track & Field");
    });
  });

  describe("result formatting", () => {
    it("should include website URL", async () => {
      const result = await tool.invoke({ query: "USAS" });
      expect(result).toContain("Website: https://www.usaswimming.org");
    });

    it("should include Olympic program for summer sports", async () => {
      const result = await tool.invoke({ query: "USAS" });
      expect(result).toContain("Olympic Program: Summer Olympics");
    });

    it("should include Olympic program for winter sports", async () => {
      const result = await tool.invoke({ query: "USSS" });
      expect(result).toContain("Olympic Program: Winter Olympics");
    });

    it("should include bylaws URL when available", async () => {
      const result = await tool.invoke({ query: "USAS" });
      expect(result).toContain("Bylaws: https://www.usaswimming.org/bylaws");
    });

    it("should include selection procedures URL when available", async () => {
      const result = await tool.invoke({ query: "USAS" });
      expect(result).toContain("Selection Procedures:");
    });

    it("should include international federation", async () => {
      const result = await tool.invoke({ query: "USAS" });
      expect(result).toContain("International Federation: World Aquatics");
    });

    it("should include Paralympic status when true", async () => {
      const result = await tool.invoke({ query: "USSS" });
      expect(result).toContain("Paralympic: Yes");
    });

    it("should include status and effective date", async () => {
      const result = await tool.invoke({ query: "USAS" });
      expect(result).toContain("Status: active");
      expect(result).toContain("Effective Date: 2024-01-01");
    });
  });

  describe("runners-up", () => {
    it("should include runners-up when scores are close", async () => {
      const result = await tool.invoke({ query: "US" });
      // Multiple orgs match "US" so should show other possible matches
      expect(result).toContain("Other possible matches");
    });
  });

  describe("no match", () => {
    it("should return helpful message when no match found", async () => {
      const result = await tool.invoke({ query: "Nonexistent Sport" });
      expect(result).toContain("No organization found");
      expect(result).toContain("Try searching with the full name");
    });
  });

  describe("error handling", () => {
    it("should handle entity errors gracefully", async () => {
      mockGetAll.mockRejectedValueOnce(new Error("DynamoDB error"));
      const result = await tool.invoke({ query: "USAS" });
      expect(result).toContain("Sport organization lookup failed");
      expect(result).toContain("DynamoDB error");
    });
  });

  describe("query normalization", () => {
    it("should trim whitespace from query", async () => {
      const result = await tool.invoke({ query: "  USAS  " });
      expect(result).toContain("USA Swimming");
    });
  });
});
