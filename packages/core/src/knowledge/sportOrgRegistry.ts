import type { SportOrgEntity } from "@usopc/shared";
import type { SportOrganization } from "../types/sport-org.js";

/**
 * In-memory cache for loaded sport organizations with TTL.
 */
let cachedOrgs: SportOrganization[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let entityRef: SportOrgEntity | null = null;

/**
 * Initialize the sport org registry with a DynamoDB entity reference.
 * Must be called before loadSportOrganizations().
 */
export function initSportOrgRegistry(entity: SportOrgEntity): void {
  entityRef = entity;
  cachedOrgs = [];
  cacheTimestamp = 0;
}

/**
 * Loads sport organizations from DynamoDB via the SportOrgEntity.
 * Results are cached in memory with a 5-minute TTL.
 *
 * @returns Array of SportOrganization objects
 * @throws Error if the registry has not been initialized
 */
export async function loadSportOrganizations(): Promise<SportOrganization[]> {
  const now = Date.now();
  if (cachedOrgs.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedOrgs;
  }
  if (!entityRef) {
    throw new Error(
      "SportOrgRegistry not initialized. Call initSportOrgRegistry() first.",
    );
  }
  cachedOrgs = await entityRef.getAll();
  cacheTimestamp = now;
  return cachedOrgs;
}

/**
 * Clears the in-memory cache, forcing a reload on next access.
 * Useful for testing or when the data is updated.
 */
export function clearSportOrgCache(): void {
  cachedOrgs = [];
  cacheTimestamp = 0;
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
  if (cachedOrgs.length === 0) {
    return undefined;
  }

  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return undefined;
  }

  // Priority 1: Exact ID match
  const idMatch = cachedOrgs.find(
    (org) => org.id.toLowerCase() === normalizedQuery.replace(/\s+/g, "_"),
  );
  if (idMatch) return idMatch;

  // Priority 2: Exact abbreviation match
  const abbrevMatch = cachedOrgs.find(
    (org) =>
      org.abbreviation && normalize(org.abbreviation) === normalizedQuery,
  );
  if (abbrevMatch) return abbrevMatch;

  // Priority 3: Official name contains query
  const nameMatch = cachedOrgs.find((org) =>
    normalize(org.officialName).includes(normalizedQuery),
  );
  if (nameMatch) return nameMatch;

  // Priority 4: Query contains official name
  const reverseNameMatch = cachedOrgs.find((org) =>
    normalizedQuery.includes(normalize(org.officialName)),
  );
  if (reverseNameMatch) return reverseNameMatch;

  // Priority 5: Any alias matches
  const aliasMatch = cachedOrgs.find((org) =>
    org.aliases.some(
      (alias) =>
        normalize(alias).includes(normalizedQuery) ||
        normalizedQuery.includes(normalize(alias)),
    ),
  );
  if (aliasMatch) return aliasMatch;

  // Priority 6: Any sport matches
  const sportMatch = cachedOrgs.find((org) =>
    org.sports.some(
      (sport) =>
        normalize(sport).includes(normalizedQuery) ||
        normalizedQuery.includes(normalize(sport)),
    ),
  );
  if (sportMatch) return sportMatch;

  // Priority 7: Any keyword matches
  const keywordMatch = cachedOrgs.find((org) =>
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
  if (cachedOrgs.length === 0) {
    return [];
  }

  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return [];
  }

  return cachedOrgs.filter((org) => {
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
