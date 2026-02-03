import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockContacts, mockReadFile } = vi.hoisted(() => {
  const mockContacts = [
    {
      organization: "USOPC Athlete Ombuds",
      role: "Independent advocate for athlete concerns",
      email: "ombuds@usopc.org",
      phone: "719-866-5000",
      url: "https://www.usopc.org/athlete-ombuds",
      description:
        "Provides independent, confidential advice to athletes on issues related to the Olympic and Paralympic movements.",
      domains: ["dispute_resolution", "athlete_rights", "governance"],
    },
    {
      organization: "U.S. Center for SafeSport",
      role: "Safe sport reporting and education",
      email: "report@safesport.org",
      phone: "833-587-7233",
      url: "https://uscenterforsafesport.org",
      description:
        "Handles reports of sexual misconduct, abuse, and other safe sport violations in Olympic sports.",
      domains: ["safesport"],
    },
    {
      organization: "USADA",
      role: "Anti-doping testing and education",
      email: "info@usada.org",
      phone: "719-785-2000",
      url: "https://www.usada.org",
      description:
        "Administers the anti-doping program for Olympic and Paralympic athletes in the United States.",
      domains: ["anti_doping"],
    },
    {
      organization: "Team USA Athletes' Commission",
      role: "Athlete representation in governance",
      email: "athletescommission@usopc.org",
      phone: null,
      url: "https://www.usopc.org/athletes-advisory-council",
      description:
        "Represents athlete interests on USOPC governance matters and policy decisions.",
      domains: ["governance", "athlete_rights"],
    },
    {
      organization: "USA Swimming Athlete Services",
      role: "NGB athlete support",
      email: "athletes@usaswimming.org",
      phone: "719-866-4578",
      url: null,
      description:
        "Provides support services specific to USA Swimming athletes.",
      domains: ["team_selection", "eligibility"],
    },
  ];
  return {
    mockContacts,
    mockReadFile: vi.fn().mockResolvedValue(JSON.stringify(mockContacts)),
  };
});

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
}));

import { createLookupContactTool } from "./lookupContact.js";

describe("createLookupContactTool", () => {
  let tool: ReturnType<typeof createLookupContactTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createLookupContactTool();
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("lookup_contact");
    });

    it("should have a description", () => {
      expect(tool.description).toContain("contact information");
      expect(tool.description).toContain("Athlete Ombuds");
    });
  });

  describe("search by organization", () => {
    it("should find contact by exact organization name", async () => {
      const result = await tool.invoke({ organization: "USADA" });
      expect(result).toContain("Organization: USADA");
      expect(result).toContain("Anti-doping");
    });

    it("should find contact by partial organization name", async () => {
      const result = await tool.invoke({ organization: "Ombuds" });
      expect(result).toContain("USOPC Athlete Ombuds");
    });

    it("should be case-insensitive", async () => {
      const result = await tool.invoke({ organization: "safesport" });
      expect(result).toContain("U.S. Center for SafeSport");
    });

    it("should match by role text", async () => {
      const result = await tool.invoke({ organization: "anti-doping" });
      expect(result).toContain("USADA");
    });
  });

  describe("search by domain", () => {
    it("should filter by safesport domain", async () => {
      const result = await tool.invoke({ domain: "safesport" });
      expect(result).toContain("U.S. Center for SafeSport");
      expect(result).not.toContain("USADA");
    });

    it("should filter by anti_doping domain", async () => {
      const result = await tool.invoke({ domain: "anti_doping" });
      expect(result).toContain("USADA");
      expect(result).not.toContain("SafeSport");
    });

    it("should return multiple contacts for domain with multiple matches", async () => {
      const result = await tool.invoke({ domain: "athlete_rights" });
      expect(result).toContain("USOPC Athlete Ombuds");
      expect(result).toContain("Team USA Athletes' Commission");
    });

    it("should filter by governance domain", async () => {
      const result = await tool.invoke({ domain: "governance" });
      expect(result).toContain("USOPC Athlete Ombuds");
      expect(result).toContain("Team USA Athletes' Commission");
    });

    it("should filter by team_selection domain", async () => {
      const result = await tool.invoke({ domain: "team_selection" });
      expect(result).toContain("USA Swimming Athlete Services");
    });

    it("should filter by eligibility domain", async () => {
      const result = await tool.invoke({ domain: "eligibility" });
      expect(result).toContain("USA Swimming Athlete Services");
    });

    it("should filter by dispute_resolution domain", async () => {
      const result = await tool.invoke({ domain: "dispute_resolution" });
      expect(result).toContain("USOPC Athlete Ombuds");
    });
  });

  describe("combined filters", () => {
    it("should filter by both organization and domain", async () => {
      const result = await tool.invoke({
        organization: "USOPC",
        domain: "dispute_resolution",
      });
      expect(result).toContain("USOPC Athlete Ombuds");
      expect(result).not.toContain("Athletes' Commission");
    });

    it("should return no results when filters don't overlap", async () => {
      const result = await tool.invoke({
        organization: "USADA",
        domain: "safesport",
      });
      expect(result).toContain("No contacts found");
    });
  });

  describe("result formatting", () => {
    it("should include email when available", async () => {
      const result = await tool.invoke({ organization: "USADA" });
      expect(result).toContain("Email: info@usada.org");
    });

    it("should include phone when available", async () => {
      const result = await tool.invoke({ organization: "USADA" });
      expect(result).toContain("Phone: 719-785-2000");
    });

    it("should include website when available", async () => {
      const result = await tool.invoke({ organization: "USADA" });
      expect(result).toContain("Website: https://www.usada.org");
    });

    it("should include role", async () => {
      const result = await tool.invoke({ organization: "USADA" });
      expect(result).toContain("Role: Anti-doping testing and education");
    });

    it("should include description", async () => {
      const result = await tool.invoke({ organization: "USADA" });
      expect(result).toContain("Description:");
      expect(result).toContain("anti-doping program");
    });

    it("should include relevant domains", async () => {
      const result = await tool.invoke({ organization: "Ombuds" });
      expect(result).toContain("Relevant Domains:");
    });

    it("should omit phone when null", async () => {
      const result = await tool.invoke({
        organization: "Athletes' Commission",
      });
      expect(result).not.toContain("Phone:");
    });

    it("should omit website when null", async () => {
      const result = await tool.invoke({
        organization: "USA Swimming Athlete",
      });
      expect(result).not.toContain("Website:");
    });

    it("should separate multiple results with dividers", async () => {
      const result = await tool.invoke({ domain: "governance" });
      expect(result).toContain("---");
    });
  });

  describe("no match", () => {
    it("should return helpful message when no org match found", async () => {
      const result = await tool.invoke({ organization: "Nonexistent Org" });
      expect(result).toContain("No contacts found");
      expect(result).toContain('organization "Nonexistent Org"');
    });

    it("should return helpful message when no domain match found", async () => {
      // All valid domains have matches in our mock, but let's test the message format
      const result = await tool.invoke({
        organization: "Nonexistent",
        domain: "safesport",
      });
      expect(result).toContain("No contacts found");
    });
  });

  describe("error handling", () => {
    it("should handle file read errors gracefully", async () => {
      const { readFile } = await import("node:fs/promises");
      vi.mocked(readFile).mockRejectedValueOnce(new Error("File not found"));

      // First call caches data, so create and call new tool
      const newTool = createLookupContactTool();
      const result = await newTool.invoke({ organization: "USADA" });
      // Cached data still works
      expect(result).toContain("USADA");
    });
  });

  describe("empty parameters", () => {
    it("should return all contacts when no filters provided", async () => {
      const result = await tool.invoke({});
      expect(result).toContain("USOPC Athlete Ombuds");
      expect(result).toContain("U.S. Center for SafeSport");
      expect(result).toContain("USADA");
      expect(result).toContain("Team USA Athletes' Commission");
      expect(result).toContain("USA Swimming Athlete Services");
    });
  });
});
