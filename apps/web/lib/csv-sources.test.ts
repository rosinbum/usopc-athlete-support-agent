import { describe, it, expect } from "vitest";
import {
  parseSourceCSV,
  validateSourceRows,
  CSV_TEMPLATE,
} from "./csv-sources.js";

// ---------------------------------------------------------------------------
// parseSourceCSV
// ---------------------------------------------------------------------------

describe("parseSourceCSV", () => {
  it("parses a valid CSV with all columns", () => {
    const csv = [
      "title,documentType,topicDomains,url,description,id,format,priority,authorityLevel,ngbId",
      '"USOPC Bylaws",bylaws,governance,https://example.com/bylaws.pdf,"Official bylaws",usopc-bylaws,pdf,high,usopc_governance,',
    ].join("\n");

    const { rows, parseErrors } = parseSourceCSV(csv);
    expect(parseErrors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("USOPC Bylaws");
    expect(rows[0]!.documentType).toBe("bylaws");
    expect(rows[0]!.url).toBe("https://example.com/bylaws.pdf");
  });

  it("parses multiple rows", () => {
    const csv = [
      "title,documentType,topicDomains,url,description",
      '"Source A",policy,governance,https://a.com/a.pdf,"Desc A"',
      '"Source B",bylaws,safesport,https://b.com/b.pdf,"Desc B"',
    ].join("\n");

    const { rows, parseErrors } = parseSourceCSV(csv);
    expect(parseErrors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  it("trims whitespace from headers and values", () => {
    const csv = [
      "  title , documentType , topicDomains , url , description ",
      '  My Source , policy , governance , https://x.com/x.pdf , "A description" ',
    ].join("\n");

    const { rows } = parseSourceCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("My Source");
    expect(rows[0]!.documentType).toBe("policy");
  });

  it("skips empty lines", () => {
    const csv = [
      "title,documentType,topicDomains,url,description",
      '"Source A",policy,governance,https://a.com/a.pdf,"Desc"',
      "",
      "",
    ].join("\n");

    const { rows } = parseSourceCSV(csv);
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// validateSourceRows — defaults
// ---------------------------------------------------------------------------

describe("validateSourceRows — defaults", () => {
  it("auto-generates id from title when id is empty", () => {
    const rows = [
      {
        title: "USOPC Athlete Handbook",
        documentType: "policy",
        topicDomains: "governance",
        url: "https://example.com/handbook.pdf",
        description: "Handbook description",
        id: "",
        format: "",
        priority: "",
        authorityLevel: "",
        ngbId: "",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("valid");
    expect(results[0]!.data.id).toBe("usopc-athlete-handbook");
  });

  it("applies default format (pdf), priority (medium), and authorityLevel (educational_guidance)", () => {
    const rows = [
      {
        title: "Test Source",
        documentType: "policy",
        topicDomains: "governance",
        url: "https://example.com/test.pdf",
        description: "Test",
        id: "",
        format: "",
        priority: "",
        authorityLevel: "",
        ngbId: "",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("valid");
    expect(results[0]!.data.format).toBe("pdf");
    expect(results[0]!.data.priority).toBe("medium");
    expect(results[0]!.data.authorityLevel).toBe("educational_guidance");
  });

  it("sets ngbId to null when empty", () => {
    const rows = [
      {
        title: "Test",
        documentType: "policy",
        topicDomains: "governance",
        url: "https://example.com/test.pdf",
        description: "Test",
        id: "test",
        format: "pdf",
        priority: "medium",
        authorityLevel: "educational_guidance",
        ngbId: "",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.data.ngbId).toBeNull();
  });

  it("splits pipe-delimited topicDomains", () => {
    const rows = [
      {
        title: "Test",
        documentType: "policy",
        topicDomains: "governance|safesport|eligibility",
        url: "https://example.com/test.pdf",
        description: "Test",
        id: "test",
        format: "pdf",
        priority: "medium",
        authorityLevel: "educational_guidance",
        ngbId: "",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("valid");
    expect(results[0]!.data.topicDomains).toEqual([
      "governance",
      "safesport",
      "eligibility",
    ]);
  });
});

// ---------------------------------------------------------------------------
// validateSourceRows — validation errors
// ---------------------------------------------------------------------------

describe("validateSourceRows — validation", () => {
  it("marks row invalid when title is missing", () => {
    const rows = [
      {
        title: "",
        documentType: "policy",
        topicDomains: "governance",
        url: "https://example.com/test.pdf",
        description: "Test",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("invalid");
    expect(results[0]!.errors.some((e) => e.includes("Title"))).toBe(true);
  });

  it("marks row invalid for bad URL", () => {
    const rows = [
      {
        title: "Test",
        documentType: "policy",
        topicDomains: "governance",
        url: "not-a-url",
        description: "Test",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("invalid");
    expect(results[0]!.errors.some((e) => e.includes("url"))).toBe(true);
  });

  it("marks row invalid for unrecognized documentType", () => {
    const rows = [
      {
        title: "Test",
        documentType: "unknown_type",
        topicDomains: "governance",
        url: "https://example.com/test.pdf",
        description: "Test",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("invalid");
    expect(results[0]!.errors.some((e) => e.includes("documentType"))).toBe(
      true,
    );
  });

  it("marks row invalid for unrecognized topicDomain", () => {
    const rows = [
      {
        title: "Test",
        documentType: "policy",
        topicDomains: "governance|fake_domain",
        url: "https://example.com/test.pdf",
        description: "Test",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("invalid");
    expect(results[0]!.errors.some((e) => e.includes("topicDomains"))).toBe(
      true,
    );
  });

  it("marks row invalid when topicDomains is empty", () => {
    const rows = [
      {
        title: "Test",
        documentType: "policy",
        topicDomains: "",
        url: "https://example.com/test.pdf",
        description: "Test",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("invalid");
    expect(results[0]!.errors.some((e) => e.includes("topicDomains"))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// validateSourceRows — duplicate detection
// ---------------------------------------------------------------------------

describe("validateSourceRows — duplicates", () => {
  it("marks row as duplicate when id matches existing source", () => {
    const rows = [
      {
        title: "Test",
        documentType: "policy",
        topicDomains: "governance",
        url: "https://example.com/test.pdf",
        description: "Test",
        id: "existing-source",
        format: "pdf",
        priority: "medium",
        authorityLevel: "educational_guidance",
        ngbId: "",
      },
    ];

    const results = validateSourceRows(rows, new Set(["existing-source"]));
    expect(results[0]!.status).toBe("duplicate");
    expect(results[0]!.errors[0]).toContain("Duplicate ID");
  });

  it("marks second row as duplicate when two rows have the same generated id", () => {
    const rows = [
      {
        title: "Same Title",
        documentType: "policy",
        topicDomains: "governance",
        url: "https://example.com/a.pdf",
        description: "First",
      },
      {
        title: "Same Title",
        documentType: "bylaws",
        topicDomains: "safesport",
        url: "https://example.com/b.pdf",
        description: "Second",
      },
    ];

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("valid");
    expect(results[1]!.status).toBe("duplicate");
  });
});

// ---------------------------------------------------------------------------
// CSV_TEMPLATE
// ---------------------------------------------------------------------------

describe("CSV_TEMPLATE", () => {
  it("is parseable and produces a valid row", () => {
    const { rows, parseErrors } = parseSourceCSV(CSV_TEMPLATE);
    expect(parseErrors).toHaveLength(0);
    expect(rows).toHaveLength(1);

    const results = validateSourceRows(rows, new Set());
    expect(results[0]!.status).toBe("valid");
    expect(results[0]!.data.title).toBe("USOPC Bylaws");
  });
});
