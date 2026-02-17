import type { TopicDomain } from "@usopc/shared";

/**
 * Context hints for a specific NGB.
 * Used to improve evaluation accuracy during intelligent discovery.
 */
export interface NgbHints {
  ngbId: string;
  displayName: string;
  domain: string;
  urlPatterns: string[];
  documentTypes: string[];
  topicDomains: TopicDomain[];
  keywords: string[];
}

/**
 * Search keyword mappings for topic domains.
 * Used to generate targeted search queries.
 */
export interface TopicKeywords {
  domain: TopicDomain;
  keywords: string[];
}

/**
 * NGB hint definitions for the 5 major NGBs in discovery-config.json.
 */
const NGB_HINTS: NgbHints[] = [
  {
    ngbId: "usa-track-field",
    displayName: "USA Track & Field",
    domain: "usatf.org",
    urlPatterns: [
      "/governance/",
      "/athlete/",
      "/selection",
      "/policy/",
      "/bylaws",
      "/rules",
      "/about/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "rulebook",
      "bylaws",
      "policy",
      "procedure",
    ],
    topicDomains: [
      "team_selection",
      "eligibility",
      "governance",
      "athlete_rights",
      "anti_doping",
    ],
    keywords: [
      "USATF",
      "track and field",
      "Olympic trials",
      "selection standards",
      "qualification",
      "championships",
      "athlete eligibility",
      "leadership",
      "board of directors",
      "contact",
      "staff directory",
    ],
  },
  {
    ngbId: "usa-swimming",
    displayName: "USA Swimming",
    domain: "usaswimming.org",
    urlPatterns: [
      "/governance/",
      "/national-team/",
      "/selection",
      "/safe-sport",
      "/rules-regulations",
      "/about/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "rulebook",
      "bylaws",
      "policy",
      "code",
    ],
    topicDomains: [
      "team_selection",
      "safesport",
      "eligibility",
      "governance",
      "athlete_rights",
    ],
    keywords: [
      "USA Swimming",
      "swimming",
      "Olympic trials",
      "qualification times",
      "national team",
      "time standards",
      "safe sport",
      "leadership",
      "board of directors",
      "contact",
      "staff directory",
    ],
  },
  {
    ngbId: "usa-gymnastics",
    displayName: "USA Gymnastics",
    domain: "usagym.org",
    urlPatterns: [
      "/pages/aboutus/",
      "/pages/education/",
      "/pages/gymnastics101/",
      "/safesport",
      "/selection",
      "/about/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: ["policy", "procedure", "code", "bylaws", "protocol"],
    topicDomains: [
      "safesport",
      "team_selection",
      "governance",
      "athlete_rights",
      "eligibility",
    ],
    keywords: [
      "USA Gymnastics",
      "gymnastics",
      "safe sport",
      "athlete protection",
      "selection camps",
      "national team",
      "athlete safety",
      "leadership",
      "board of directors",
      "contact",
      "staff directory",
    ],
  },
  {
    ngbId: "usa-basketball",
    displayName: "USA Basketball",
    domain: "usabasketball.com",
    urlPatterns: [
      "/about/",
      "/governance/",
      "/athlete-safety/",
      "/selection",
      "/policies/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "policy",
      "bylaws",
      "procedure",
      "code",
    ],
    topicDomains: [
      "team_selection",
      "safesport",
      "governance",
      "athlete_rights",
      "eligibility",
    ],
    keywords: [
      "USA Basketball",
      "basketball",
      "Olympic roster",
      "selection criteria",
      "national team",
      "athlete safety",
      "leadership",
      "board of directors",
      "contact",
      "staff directory",
    ],
  },
  {
    ngbId: "usa-hockey",
    displayName: "USA Hockey",
    domain: "usahockey.com",
    urlPatterns: [
      "/page/show/",
      "/safesport",
      "/olympicteam",
      "/nationaljuniorteam",
      "/bylaws",
      "/about/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "rulebook",
      "policy",
      "bylaws",
      "code",
    ],
    topicDomains: [
      "team_selection",
      "safesport",
      "eligibility",
      "governance",
      "athlete_rights",
    ],
    keywords: [
      "USA Hockey",
      "hockey",
      "Olympic roster",
      "selection camp",
      "national team",
      "safe sport",
      "leadership",
      "board of directors",
      "contact",
      "staff directory",
    ],
  },
];

/**
 * Topic domain keyword mappings for targeted search.
 */
const TOPIC_KEYWORDS: TopicKeywords[] = [
  {
    domain: "team_selection",
    keywords: [
      "team selection",
      "selection procedures",
      "Olympic trials",
      "qualification standards",
      "nomination criteria",
      "roster selection",
      "selection camp",
      "team trials",
    ],
  },
  {
    domain: "dispute_resolution",
    keywords: [
      "grievance",
      "arbitration",
      "dispute resolution",
      "appeals",
      "complaints",
      "hearing procedures",
      "AAA arbitration",
    ],
  },
  {
    domain: "safesport",
    keywords: [
      "SafeSport",
      "athlete safety",
      "abuse prevention",
      "misconduct",
      "safe sport policy",
      "athlete protection",
      "reporting procedures",
    ],
  },
  {
    domain: "anti_doping",
    keywords: [
      "anti-doping",
      "USADA",
      "drug testing",
      "TUE",
      "therapeutic use exemption",
      "doping violations",
      "whereabouts",
    ],
  },
  {
    domain: "eligibility",
    keywords: [
      "eligibility",
      "athlete eligibility",
      "amateur status",
      "citizenship requirements",
      "age requirements",
      "competition eligibility",
    ],
  },
  {
    domain: "governance",
    keywords: [
      "bylaws",
      "governance",
      "board of directors",
      "organizational structure",
      "policies",
      "procedures",
      "constitution",
      "leadership",
      "contact information",
      "board members",
      "committee roster",
      "grievance officer",
      "compliance officer",
    ],
  },
  {
    domain: "athlete_rights",
    keywords: [
      "athlete rights",
      "athlete agreement",
      "athlete representation",
      "athlete voice",
      "athlete ombudsman",
      "athlete welfare",
    ],
  },
];

/**
 * Get context hints for a specific NGB by ID.
 *
 * @param ngbId - The NGB identifier (e.g., "usa-swimming")
 * @returns NGB hints or undefined if not found
 */
export function getHintsByNgb(ngbId: string): NgbHints | undefined {
  return NGB_HINTS.find((hint) => hint.ngbId === ngbId);
}

/**
 * Get context hints for a specific NGB by domain.
 *
 * @param domain - The domain name (e.g., "usaswimming.org")
 * @returns NGB hints or undefined if not found
 */
export function getHintsByDomain(domain: string): NgbHints | undefined {
  return NGB_HINTS.find((hint) => hint.domain === domain);
}

/**
 * Get all NGB hints.
 *
 * @returns Array of all NGB hints
 */
export function getAllNgbHints(): NgbHints[] {
  return NGB_HINTS;
}

/**
 * Get search keywords for a specific topic domain.
 *
 * @param domain - The topic domain
 * @returns Array of keywords for the domain
 */
export function getKeywordsByTopic(domain: TopicDomain): string[] {
  const mapping = TOPIC_KEYWORDS.find((tk) => tk.domain === domain);
  return mapping?.keywords ?? [];
}

/**
 * Get all topic keyword mappings.
 *
 * @returns Array of all topic keyword mappings
 */
export function getAllTopicKeywords(): TopicKeywords[] {
  return TOPIC_KEYWORDS;
}

/**
 * Generate a context hint string for LLM evaluation.
 * Includes NGB-specific information to improve evaluation accuracy.
 *
 * @param url - The URL being evaluated
 * @returns Context hint string or empty string if no hints available
 */
export function generateContextHint(url: string): string {
  const domain = new URL(url).hostname;
  const hints = getHintsByDomain(domain);

  if (!hints) {
    return "";
  }

  return `
Context Hint: This URL is from ${hints.displayName} (${hints.ngbId}).
Relevant topic domains: ${hints.topicDomains.join(", ")}
Common document types: ${hints.documentTypes.join(", ")}
Keywords to look for: ${hints.keywords.join(", ")}
`.trim();
}
