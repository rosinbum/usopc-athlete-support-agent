import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SportOrganization } from "../types/sport-org.js";

/**
 * Resolves the path to the sport-organizations.json data file.
 * Looks in the project root data/ directory.
 */
function getDataFilePath(): string {
  // Navigate from packages/core/src/knowledge/ up to the project root
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(
    currentDir,
    "..",
    "..",
    "..",
    "..",
    "data",
    "sport-organizations.json",
  );
}

/**
 * In-memory cache for loaded sport organizations.
 */
let cachedOrganizations: SportOrganization[] | null = null;

/**
 * Loads sport organizations from the data/sport-organizations.json file.
 * Results are cached in memory after the first load.
 *
 * @returns Array of SportOrganization objects
 * @throws Error if the data file cannot be read or parsed
 */
export async function loadSportOrganizations(): Promise<SportOrganization[]> {
  if (cachedOrganizations) {
    return cachedOrganizations;
  }

  const filePath = getDataFilePath();

  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as SportOrganization[];
    cachedOrganizations = data;
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load sport organizations from ${filePath}: ${message}`,
    );
  }
}

/**
 * Clears the in-memory cache, forcing a reload on next access.
 * Useful for testing or when the data file is updated.
 */
export function clearSportOrgCache(): void {
  cachedOrganizations = null;
}

/**
 * Normalizes a string for fuzzy comparison: lowercases, trims, and removes
 * common punctuation and extra whitespace.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[''"".,\-_]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Performs fuzzy matching to find a sport organization by name, abbreviation,
 * sport, or alias. Returns the best match or undefined if no match is found.
 *
 * Matching priority:
 * 1. Exact ID match
 * 2. Exact abbreviation match (case-insensitive)
 * 3. Official name contains query (case-insensitive)
 * 4. Any alias matches (case-insensitive)
 * 5. Any sport matches (case-insensitive)
 * 6. Any keyword matches (case-insensitive)
 *
 * @param query - Search string (sport name, org name, abbreviation, etc.)
 * @returns The best matching SportOrganization, or undefined
 */
export function findSportOrg(query: string): SportOrganization | undefined {
  if (!cachedOrganizations || cachedOrganizations.length === 0) {
    return undefined;
  }

  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return undefined;
  }

  // Priority 1: Exact ID match
  const idMatch = cachedOrganizations.find(
    (org) => org.id.toLowerCase() === normalizedQuery.replace(/\s+/g, "_"),
  );
  if (idMatch) return idMatch;

  // Priority 2: Exact abbreviation match
  const abbrevMatch = cachedOrganizations.find(
    (org) =>
      org.abbreviation && normalize(org.abbreviation) === normalizedQuery,
  );
  if (abbrevMatch) return abbrevMatch;

  // Priority 3: Official name contains query
  const nameMatch = cachedOrganizations.find((org) =>
    normalize(org.officialName).includes(normalizedQuery),
  );
  if (nameMatch) return nameMatch;

  // Priority 4: Query contains official name
  const reverseNameMatch = cachedOrganizations.find((org) =>
    normalizedQuery.includes(normalize(org.officialName)),
  );
  if (reverseNameMatch) return reverseNameMatch;

  // Priority 5: Any alias matches
  const aliasMatch = cachedOrganizations.find((org) =>
    org.aliases.some(
      (alias) =>
        normalize(alias).includes(normalizedQuery) ||
        normalizedQuery.includes(normalize(alias)),
    ),
  );
  if (aliasMatch) return aliasMatch;

  // Priority 6: Any sport matches
  const sportMatch = cachedOrganizations.find((org) =>
    org.sports.some(
      (sport) =>
        normalize(sport).includes(normalizedQuery) ||
        normalizedQuery.includes(normalize(sport)),
    ),
  );
  if (sportMatch) return sportMatch;

  // Priority 7: Any keyword matches
  const keywordMatch = cachedOrganizations.find((org) =>
    org.keywords.some(
      (keyword) =>
        normalize(keyword).includes(normalizedQuery) ||
        normalizedQuery.includes(normalize(keyword)),
    ),
  );
  if (keywordMatch) return keywordMatch;

  return undefined;
}

/**
 * Searches for all sport organizations matching the query.
 * Unlike findSportOrg which returns the single best match, this returns all matches.
 *
 * @param query - Search string
 * @returns Array of matching SportOrganization objects
 */
export function searchSportOrgs(query: string): SportOrganization[] {
  if (!cachedOrganizations || cachedOrganizations.length === 0) {
    return [];
  }

  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return [];
  }

  return cachedOrganizations.filter((org) => {
    const fields = [
      org.id,
      org.officialName,
      org.abbreviation ?? "",
      ...org.aliases,
      ...org.sports,
      ...org.keywords,
      org.internationalFederation ?? "",
    ];

    return fields.some((field) => {
      const normalizedField = normalize(field);
      return (
        normalizedField.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedField)
      );
    });
  });
}
