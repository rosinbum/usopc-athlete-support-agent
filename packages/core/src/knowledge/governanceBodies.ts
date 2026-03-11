export type OrgLevel = "usopc" | "ngb" | "if";

export interface GovernanceBody {
  canonicalName: string;
  level: OrgLevel;
  aliases: string[];
  abbreviation?: string;
  disambiguationNote: string;
  confusableWith?: string[];
}

export const GOVERNANCE_BODIES: GovernanceBody[] = [
  {
    canonicalName: "USOPC Athletes' Advisory Council",
    level: "usopc",
    aliases: [
      "Team USA Athletes' Commission",
      "Athletes' Advisory Council",
      "Athletes' Commission",
      "AAC",
    ],
    abbreviation: "AAC",
    disambiguationNote:
      'The USOPC-level athlete representation body. "Team USA Athletes\' Commission" ' +
      "is the same body — not a separate organization. Represents athletes across all " +
      "Olympic and Paralympic sports at the national level.",
    confusableWith: [
      "NGB Athletes' Advisory Councils",
      "IF Athletes' Commissions",
    ],
  },
  {
    canonicalName: "NGB Athletes' Advisory Councils",
    level: "ngb",
    aliases: ["NGB AAC", "sport-specific AAC"],
    disambiguationNote:
      "Each National Governing Body may have its own Athletes' Advisory Council " +
      "(e.g., USA Swimming Athletes' Advisory Council, USA Track & Field Athletes' " +
      "Advisory Council). These are distinct from the USOPC-level AAC and operate " +
      "within a single sport.",
    confusableWith: [
      "USOPC Athletes' Advisory Council",
      "IF Athletes' Commissions",
    ],
  },
  {
    canonicalName: "IF Athletes' Commissions",
    level: "if",
    aliases: [
      "International Federation Athletes' Commission",
      "IF Athletes' Committee",
    ],
    disambiguationNote:
      "International Federations (e.g., World Aquatics, World Athletics) have their " +
      "own Athletes' Commissions that represent athletes at the global level. These " +
      "are distinct from both the USOPC AAC and NGB-level AACs.",
    confusableWith: [
      "USOPC Athletes' Advisory Council",
      "NGB Athletes' Advisory Councils",
    ],
  },
  {
    canonicalName: "Athlete Ombuds",
    level: "usopc",
    aliases: ["Athlete Ombudsman", "USOPC Ombuds", "Ombuds"],
    disambiguationNote:
      "A USOPC-level independent resource providing confidential advice to athletes " +
      "on dispute resolution, rights, and governance matters. There is no NGB-level " +
      "or IF-level equivalent.",
  },
  {
    canonicalName: "U.S. Center for SafeSport",
    level: "usopc",
    aliases: ["SafeSport Center", "Center for SafeSport", "SafeSport", "USCSS"],
    disambiguationNote:
      "The independent national organization responsible for investigating and " +
      "resolving abuse and misconduct claims in Olympic and Paralympic sport. " +
      "Distinct from NGB-level SafeSport contacts or compliance officers, who " +
      "handle local SafeSport training and reporting but do not adjudicate cases.",
  },
  {
    canonicalName: "USOPC Board of Directors",
    level: "usopc",
    aliases: ["USOPC Board"],
    disambiguationNote:
      "The governing board of the United States Olympic & Paralympic Committee. " +
      "Distinct from NGB boards of directors, which govern individual sports.",
    confusableWith: ["NGB Boards of Directors"],
  },
  {
    canonicalName: "NGB Boards of Directors",
    level: "ngb",
    aliases: ["NGB Board"],
    disambiguationNote:
      "Each NGB has its own board of directors responsible for governing that sport. " +
      "Distinct from the USOPC Board of Directors.",
    confusableWith: ["USOPC Board of Directors"],
  },
];

/**
 * Formats the governance body registry into a prompt-injectable reference string.
 */
export function buildDisambiguationReference(): string {
  const lines: string[] = [];

  for (const body of GOVERNANCE_BODIES) {
    lines.push(`**${body.canonicalName}** (${body.level.toUpperCase()} level)`);
    if (body.aliases.length > 0) {
      lines.push(`  Also known as: ${body.aliases.join(", ")}`);
    }
    lines.push(`  ${body.disambiguationNote}`);
    if (body.confusableWith && body.confusableWith.length > 0) {
      lines.push(`  ⚠ Often confused with: ${body.confusableWith.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
