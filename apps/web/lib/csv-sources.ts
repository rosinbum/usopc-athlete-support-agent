import Papa from "papaparse";
import { z } from "zod";
import {
  TOPIC_DOMAINS,
  AUTHORITY_LEVELS,
  DOCUMENT_TYPES,
} from "./source-constants.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Zod schema for a single CSV row (after defaults applied)
// ---------------------------------------------------------------------------

const csvSourceSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  title: z.string().min(1, "Title is required"),
  documentType: z.enum(DOCUMENT_TYPES, {
    error: `Must be one of: ${DOCUMENT_TYPES.join(", ")}`,
  }),
  topicDomains: z
    .array(
      z.enum(TOPIC_DOMAINS, {
        error: `Must be one of: ${TOPIC_DOMAINS.join(", ")}`,
      }),
    )
    .min(1, "At least one topic domain is required"),
  url: z.string().url("Must be a valid URL"),
  description: z.string().min(1, "Description is required"),
  format: z.enum(["pdf", "html", "text"]),
  priority: z.enum(["high", "medium", "low"]),
  authorityLevel: z.enum(AUTHORITY_LEVELS, {
    error: `Must be one of: ${AUTHORITY_LEVELS.join(", ")}`,
  }),
  ngbId: z.string().nullable(),
});

export type CSVSourceInput = z.infer<typeof csvSourceSchema>;

// ---------------------------------------------------------------------------
// Row validation result
// ---------------------------------------------------------------------------

export type RowStatus = "valid" | "invalid" | "duplicate";

export interface ValidatedRow {
  rowIndex: number;
  data: CSVSourceInput;
  errors: string[];
  status: RowStatus;
}

// ---------------------------------------------------------------------------
// parseSourceCSV — parse raw CSV text into structured rows with defaults
// ---------------------------------------------------------------------------

export function parseSourceCSV(csvText: string): {
  rows: Record<string, string>[];
  parseErrors: string[];
} {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });

  const parseErrors = result.errors.map(
    (e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`,
  );

  return { rows: result.data, parseErrors };
}

// ---------------------------------------------------------------------------
// applyDefaults — fill in optional columns with default values
// ---------------------------------------------------------------------------

function applyDefaults(raw: Record<string, string>): Record<string, unknown> {
  const title = raw.title ?? "";
  return {
    id: raw.id?.trim() || toSlug(title),
    title,
    documentType: raw.documentType ?? "",
    topicDomains: raw.topicDomains
      ? raw.topicDomains.split("|").map((d) => d.trim())
      : [],
    url: raw.url ?? "",
    description: raw.description ?? "",
    format: raw.format?.trim() || "pdf",
    priority: raw.priority?.trim() || "medium",
    authorityLevel: raw.authorityLevel?.trim() || "educational_guidance",
    ngbId: raw.ngbId?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// validateSourceRows — validate rows and mark duplicates
// ---------------------------------------------------------------------------

export function validateSourceRows(
  rows: Record<string, string>[],
  existingIds: Set<string>,
): ValidatedRow[] {
  const seenIds = new Set<string>();

  return rows.map((raw, index) => {
    const withDefaults = applyDefaults(raw);
    const result = csvSourceSchema.safeParse(withDefaults);

    if (!result.success) {
      const errors = result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );
      return {
        rowIndex: index,
        data: withDefaults as CSVSourceInput,
        errors,
        status: "invalid" as const,
      };
    }

    const data = result.data;

    // Check for duplicate against existing sources or earlier rows in this batch
    if (existingIds.has(data.id) || seenIds.has(data.id)) {
      return {
        rowIndex: index,
        data,
        errors: [`Duplicate ID: "${data.id}" already exists`],
        status: "duplicate" as const,
      };
    }

    seenIds.add(data.id);

    return {
      rowIndex: index,
      data,
      errors: [],
      status: "valid" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// CSV template for download
// ---------------------------------------------------------------------------

export const CSV_TEMPLATE =
  "title,documentType,topicDomains,url,description,id,format,priority,authorityLevel,ngbId\n" +
  '"USOPC Bylaws",bylaws,governance|athlete_rights,https://example.com/bylaws.pdf,"Official USOPC bylaws document",,pdf,high,usopc_governance,\n';
