import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime } from "./format-date.js";

describe("formatDate", () => {
  it("formats a full ISO date string as date-only", () => {
    const result = formatDate("2024-01-15T14:30:00Z");
    expect(result).toMatch(/Jan 15, 2024/);
  });

  it("formats a date-only string without off-by-one error", () => {
    // Date-only strings parsed as UTC can shift days in negative-offset TZs.
    // The safeParse helper appends T00:00:00 to force local interpretation.
    const result = formatDate("2024-01-15");
    expect(result).toBe("Jan 15, 2024");
  });

  it('returns "Never" for null by default', () => {
    expect(formatDate(null)).toBe("Never");
  });

  it("returns custom null label when provided", () => {
    expect(formatDate(null, "N/A")).toBe("N/A");
    expect(formatDate(null, "")).toBe("");
  });

  it("returns the raw string for an unparseable date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatDateTime", () => {
  it("includes hours and minutes", () => {
    const result = formatDateTime("2024-06-01T09:15:00");
    expect(result).toMatch(/Jun 1, 2024/);
    expect(result).toMatch(/9:15/i);
  });

  it('returns "Never" for null by default', () => {
    expect(formatDateTime(null)).toBe("Never");
  });

  it("returns custom null label when provided", () => {
    expect(formatDateTime(null, "N/A")).toBe("N/A");
  });

  it("returns the raw string for an unparseable date", () => {
    expect(formatDateTime("garbage")).toBe("garbage");
  });
});
