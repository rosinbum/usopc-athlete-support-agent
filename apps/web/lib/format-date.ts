/**
 * Consolidated date formatting utilities.
 *
 * Replaces 6 inline `formatDate` implementations that had inconsistent
 * format options, null labels, and UTC handling.
 */

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

const DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Date-only strings like "2024-01-15" are parsed as UTC midnight by the spec,
 * causing off-by-one day errors in negative-offset timezones. Appending
 * T00:00:00 forces local timezone interpretation.
 */
function safeParse(dateString: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return new Date(dateString + "T00:00:00");
  }
  return new Date(dateString);
}

/** Format as date only (e.g. "Jan 15, 2024"). */
export function formatDate(
  dateString: string | null,
  nullLabel = "Never",
): string {
  if (!dateString) return nullLabel;
  try {
    const d = safeParse(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", DATE_OPTIONS);
  } catch {
    return dateString;
  }
}

/** Format as date + time (e.g. "Jan 15, 2024, 02:30 PM"). */
export function formatDateTime(
  dateString: string | null,
  nullLabel = "Never",
): string {
  if (!dateString) return nullLabel;
  try {
    const d = safeParse(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", DATETIME_OPTIONS);
  } catch {
    return dateString;
  }
}
