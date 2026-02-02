import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { TopicDomain } from "../types/index.js";
import { logger } from "@usopc/shared";

const TOPIC_DOMAINS = [
  "team_selection",
  "dispute_resolution",
  "safesport",
  "anti_doping",
  "eligibility",
  "governance",
  "athlete_rights",
] as const;

const lookupContactSchema = z.object({
  organization: z
    .string()
    .optional()
    .describe(
      "Name or partial name of the organization to look up (e.g. 'Athlete Ombuds', 'SafeSport', 'USADA').",
    ),
  domain: z
    .enum(TOPIC_DOMAINS)
    .optional()
    .describe(
      "Topic domain to filter contacts by (e.g. 'safesport', 'anti_doping', 'dispute_resolution').",
    ),
});

/**
 * Represents a contact entry in the contact-directory.json file.
 */
interface ContactEntry {
  organization: string;
  role: string;
  email?: string;
  phone?: string;
  url?: string;
  description: string;
  domains: TopicDomain[];
}

/** Cached contacts loaded from the JSON file. */
let cachedContacts: ContactEntry[] | null = null;

function getDataFilePath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, "..", "..", "..", "..", "data", "contact-directory.json");
}

async function loadContacts(): Promise<ContactEntry[]> {
  if (cachedContacts) {
    return cachedContacts;
  }

  const filePath = getDataFilePath();
  const raw = await readFile(filePath, "utf-8");
  cachedContacts = JSON.parse(raw) as ContactEntry[];
  return cachedContacts;
}

function formatContact(contact: ContactEntry): string {
  const lines: string[] = [
    `Organization: ${contact.organization}`,
    `Role: ${contact.role}`,
  ];

  if (contact.email) {
    lines.push(`Email: ${contact.email}`);
  }
  if (contact.phone) {
    lines.push(`Phone: ${contact.phone}`);
  }
  if (contact.url) {
    lines.push(`Website: ${contact.url}`);
  }

  lines.push(`Description: ${contact.description}`);

  if (contact.domains.length > 0) {
    lines.push(`Relevant Domains: ${contact.domains.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Creates the lookup_contact tool. Reads from a static JSON data file;
 * no external dependencies required.
 */
export function createLookupContactTool() {
  return tool(
    async ({ organization, domain }): Promise<string> => {
      const log = logger.child({ tool: "lookup_contact" });
      log.debug("Looking up contact", { organization, domain });

      try {
        const contacts = await loadContacts();

        let matches = contacts;

        // Filter by domain if specified
        if (domain) {
          matches = matches.filter((c) =>
            c.domains.includes(domain),
          );
        }

        // Filter by organization name if specified (case-insensitive substring)
        if (organization) {
          const orgLower = organization.toLowerCase().trim();
          matches = matches.filter((c) => {
            const orgName = c.organization.toLowerCase();
            const role = c.role.toLowerCase();
            return (
              orgName.includes(orgLower) ||
              orgLower.includes(orgName) ||
              role.includes(orgLower)
            );
          });
        }

        if (matches.length === 0) {
          const hint = organization
            ? `organization "${organization}"`
            : domain
              ? `domain "${domain}"`
              : "the given criteria";
          return `No contacts found matching ${hint}. Try searching by organization name (e.g. "Athlete Ombuds", "SafeSport", "USADA") or by domain (e.g. "safesport", "anti_doping").`;
        }

        const formatted = matches.map(formatContact).join("\n\n---\n\n");

        log.debug("Contact lookup returned results", { count: matches.length });

        return formatted;
      } catch (error) {
        log.error("Contact lookup failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return `Contact lookup failed: ${error instanceof Error ? error.message : String(error)}. The contact directory may not be available.`;
      }
    },
    {
      name: "lookup_contact",
      description:
        "Look up contact information for athlete support organizations including the Athlete Ombuds, U.S. Center for SafeSport, USADA, Team USA Athletes' Commission, and NGB-specific contacts.",
      schema: lookupContactSchema,
    },
  );
}
