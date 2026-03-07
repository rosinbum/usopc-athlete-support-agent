/**
 * Canonical list of patterns that detect section headings in legal /
 * governance documents.  Each regex matches from the start of a line;
 * the first capturing group holds the heading text.
 *
 * **Single source of truth** — both {@link sectionAwareSplit} and
 * {@link extractSections} import from here.
 */
export const HEADING_PATTERNS: RegExp[] = [
  /^(ARTICLE\s+[IVXLCDM\d]+[.:]\s*.+)/im,
  /^(SECTION\s+[\d.]+[.:]\s*.+)/im,
  /^(Section\s+[\d.]+[.:]\s*.+)/im,
  /^(CHAPTER\s+[\d]+[.:—]\s*.+)/im,
  /^(SUBCHAPTER\s+[IVXLCDM\d]+[—:].+)/im,
  /^(PART\s+[IVXLCDM\d]+[.:]\s*.+)/im,
  /^(§\s*\d{4,}\.\s*.+)/im,
  /^(Rule\s+[\d.]+[.:]\s*.+)/im,
  // Numbered headings common in NGB selection criteria (e.g., "1.3.4 Title")
  /^(\d{1,2}\.\d+[\d.]*\s+[A-Z].+)/im,
  // Top-level numbered headings (e.g., "3. REMOVAL OF ATHLETES")
  /^(\d{1,2}\.\s+[A-Z][A-Z].+)/im,
];

/**
 * Combined single-regex built from {@link HEADING_PATTERNS}.
 * Used for fast line-by-line boundary detection without iterating the array.
 */
export const HEADING_BOUNDARY: RegExp = new RegExp(
  `^(${HEADING_PATTERNS.map((r) => {
    // Strip the outer ^( ... ) and flags from each pattern source
    const src = r.source;
    // Each source is like: ^(ARTICLE\s+...)  — extract the inner group content
    return src.replace(/^\^\(/, "").replace(/\)$/, "");
  }).join("|")})`,
  "im",
);

/**
 * Extract a section title from the start of a text block.
 * Returns the first matching heading or `undefined`.
 */
export function detectTitle(text: string): string | undefined {
  for (const pattern of HEADING_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1]!.trim();
  }
  return undefined;
}
