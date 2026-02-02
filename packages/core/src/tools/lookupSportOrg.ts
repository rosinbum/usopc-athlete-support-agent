import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SportOrganization } from "../types/index.js";
import { logger } from "@usopc/shared";

const lookupSportOrgSchema = z.object({
  query: z
    .string()
    .describe(
      "Name, abbreviation, sport, or alias of the organization to look up (e.g. 'USA Swimming', 'USAT', 'fencing', 'Team USA wrestling').",
    ),
});

/** Cached sport organizations data, loaded on first invocation. */
let cachedOrgs: SportOrganization[] | null = null;

/**
 * Resolves the path to the sport-organizations.json data file.
 * Walks up from this file's location to the project root and into data/.
 */
function getDataFilePath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // From packages/core/src/tools -> project root is ../../../../
  return resolve(__dirname, "..", "..", "..", "..", "data", "sport-organizations.json");
}

async function loadOrganizations(): Promise<SportOrganization[]> {
  if (cachedOrgs) {
    return cachedOrgs;
  }

  const filePath = getDataFilePath();
  const raw = await readFile(filePath, "utf-8");
  cachedOrgs = JSON.parse(raw) as SportOrganization[];
  return cachedOrgs;
}

/**
 * Compute a simple relevance score for a candidate organization against the
 * search query. Higher is better. Returns 0 if there is no match at all.
 */
function scoreMatch(org: SportOrganization, queryLower: string): number {
  let score = 0;

  // Exact abbreviation match is the strongest signal
  if (org.abbreviation && org.abbreviation.toLowerCase() === queryLower) {
    score += 100;
  }

  // Exact official name match (case-insensitive)
  if (org.officialName.toLowerCase() === queryLower) {
    score += 90;
  }

  // Official name contains query
  if (org.officialName.toLowerCase().includes(queryLower)) {
    score += 60;
  }

  // Query contains official name
  if (queryLower.includes(org.officialName.toLowerCase())) {
    score += 50;
  }

  // Abbreviation substring
  if (org.abbreviation && org.abbreviation.toLowerCase().includes(queryLower)) {
    score += 40;
  }

  // Sport name matches
  for (const sport of org.sports) {
    if (sport.toLowerCase() === queryLower) {
      score += 70;
    } else if (sport.toLowerCase().includes(queryLower)) {
      score += 45;
    } else if (queryLower.includes(sport.toLowerCase())) {
      score += 35;
    }
  }

  // Alias matches
  for (const alias of org.aliases) {
    if (alias.toLowerCase() === queryLower) {
      score += 80;
    } else if (alias.toLowerCase().includes(queryLower)) {
      score += 40;
    } else if (queryLower.includes(alias.toLowerCase())) {
      score += 30;
    }
  }

  // Keyword matches
  for (const keyword of org.keywords) {
    if (keyword.toLowerCase() === queryLower) {
      score += 50;
    } else if (queryLower.includes(keyword.toLowerCase())) {
      score += 20;
    }
  }

  return score;
}

function formatOrgResult(org: SportOrganization): string {
  const lines: string[] = [
    `Official Name: ${org.officialName}`,
  ];

  if (org.abbreviation) {
    lines.push(`Abbreviation: ${org.abbreviation}`);
  }

  lines.push(`Type: ${org.type === "ngb" ? "National Governing Body (NGB)" : "USOPC-Managed Organization"}`);
  lines.push(`Sports: ${org.sports.join(", ")}`);

  if (org.olympicProgram) {
    const programLabel =
      org.olympicProgram === "summer"
        ? "Summer Olympics"
        : org.olympicProgram === "winter"
          ? "Winter Olympics"
          : "Pan American Games";
    lines.push(`Olympic Program: ${programLabel}`);
  }

  if (org.paralympicManaged) {
    lines.push("Paralympic: Yes");
  }

  lines.push(`Website: ${org.websiteUrl}`);

  if (org.bylawsUrl) {
    lines.push(`Bylaws: ${org.bylawsUrl}`);
  }

  if (org.selectionProceduresUrl) {
    lines.push(`Selection Procedures: ${org.selectionProceduresUrl}`);
  }

  if (org.internationalFederation) {
    lines.push(`International Federation: ${org.internationalFederation}`);
  }

  lines.push(`Status: ${org.status}`);
  lines.push(`Effective Date: ${org.effectiveDate}`);

  if (org.aliases.length > 0) {
    lines.push(`Also known as: ${org.aliases.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Creates the lookup_sport_org tool. This tool reads from a static JSON file
 * and performs fuzzy matching, so it does not require any injected dependencies.
 */
export function createLookupSportOrgTool() {
  return tool(
    async ({ query }): Promise<string> => {
      const log = logger.child({ tool: "lookup_sport_org" });
      log.debug("Looking up sport organization", { query });

      try {
        const orgs = await loadOrganizations();
        const queryLower = query.toLowerCase().trim();

        // Score all orgs and find the best match
        const scored = orgs
          .map((org) => ({ org, score: scoreMatch(org, queryLower) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score);

        if (scored.length === 0) {
          return `No organization found matching "${query}". Try searching with the full name, abbreviation, or sport name (e.g. "USA Swimming", "USAT", "fencing").`;
        }

        // Return the best match. If there are close runners-up, mention them.
        const best = scored[0];
        let result = formatOrgResult(best.org);

        // Include up to 2 runners-up if they scored within 50% of the best
        const threshold = best.score * 0.5;
        const runnersUp = scored
          .slice(1, 3)
          .filter(({ score }) => score >= threshold);

        if (runnersUp.length > 0) {
          result +=
            "\n\n--- Other possible matches ---\n" +
            runnersUp
              .map(({ org }) => `- ${org.officialName}${org.abbreviation ? ` (${org.abbreviation})` : ""}`)
              .join("\n");
        }

        log.debug("Sport org lookup succeeded", {
          match: best.org.officialName,
          score: best.score,
        });

        return result;
      } catch (error) {
        log.error("Sport org lookup failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return `Sport organization lookup failed: ${error instanceof Error ? error.message : String(error)}. The data file may not be available.`;
      }
    },
    {
      name: "lookup_sport_org",
      description:
        "Look up a National Governing Body (NGB) or USOPC-managed sport organization by name, abbreviation, sport, or alias. Returns official name, website, governance type, and available resources.",
      schema: lookupSportOrgSchema,
    },
  );
}
