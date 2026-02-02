/**
 * Clean document text before splitting.
 *
 * Normalizes whitespace, removes common PDF artifacts (page numbers, form
 * feeds, excessive blank lines), and trims the result.
 */
export function cleanText(text: string): string {
  return (
    text
      // Normalize line endings
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Remove excessive blank lines (4+ consecutive newlines -> 3)
      .replace(/\n{4,}/g, "\n\n\n")
      // Remove standalone page number lines (e.g. "Page 3", "Page 3 of 10")
      .replace(/^\s*Page\s+\d+\s*(of\s+\d+)?\s*$/gm, "")
      // Remove centered page numbers (e.g. "- 3 -")
      .replace(/^\s*-\s*\d+\s*-\s*$/gm, "")
      // Replace form-feed characters with paragraph breaks
      .replace(/\f/g, "\n\n")
      // Replace tabs with a single space
      .replace(/\t/g, " ")
      // Collapse runs of 3+ spaces to double space
      .replace(/ {3,}/g, "  ")
      .trim()
  );
}
