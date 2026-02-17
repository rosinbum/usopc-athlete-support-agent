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
 * NGB hint definitions for NGBs in discovery-config.json.
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
    ],
  },
  {
    ngbId: "usa-wrestling",
    displayName: "USA Wrestling",
    domain: "usawrestling.org",
    urlPatterns: [
      "/governance/",
      "/selection",
      "/rules/",
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
    ],
    keywords: [
      "USA Wrestling",
      "wrestling",
      "Olympic trials",
      "weight classes",
      "selection criteria",
      "national team",
    ],
  },
  {
    ngbId: "usa-volleyball",
    displayName: "USA Volleyball",
    domain: "usavolleyball.org",
    urlPatterns: [
      "/governance/",
      "/beach/",
      "/selection",
      "/about/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "bylaws",
      "policy",
      "procedure",
      "code",
    ],
    topicDomains: [
      "team_selection",
      "eligibility",
      "governance",
      "athlete_rights",
    ],
    keywords: [
      "USA Volleyball",
      "volleyball",
      "beach volleyball",
      "indoor volleyball",
      "national team",
      "selection criteria",
    ],
  },
  {
    ngbId: "usa-cycling",
    displayName: "USA Cycling",
    domain: "usacycling.org",
    urlPatterns: [
      "/governance/",
      "/racing/",
      "/selection",
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
      "USA Cycling",
      "cycling",
      "road cycling",
      "track cycling",
      "mountain bike",
      "BMX",
      "selection criteria",
      "national team",
    ],
  },
  {
    ngbId: "us-rowing",
    displayName: "US Rowing",
    domain: "usrowing.org",
    urlPatterns: [
      "/governance/",
      "/national-team/",
      "/selection",
      "/about/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "bylaws",
      "policy",
      "procedure",
      "code",
    ],
    topicDomains: [
      "team_selection",
      "eligibility",
      "governance",
      "athlete_rights",
    ],
    keywords: [
      "US Rowing",
      "rowing",
      "Olympic trials",
      "national team",
      "selection criteria",
      "athlete eligibility",
    ],
  },
  {
    ngbId: "us-fencing",
    displayName: "US Fencing",
    domain: "usafencing.org",
    urlPatterns: [
      "/governance/",
      "/athlete-handbook/",
      "/selection",
      "/about/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "handbook",
      "bylaws",
      "policy",
      "procedure",
    ],
    topicDomains: [
      "team_selection",
      "eligibility",
      "governance",
      "athlete_rights",
    ],
    keywords: [
      "US Fencing",
      "fencing",
      "athlete handbook",
      "selection criteria",
      "national team",
      "qualification",
    ],
  },
  {
    ngbId: "usa-diving",
    displayName: "USA Diving",
    domain: "usadiving.org",
    urlPatterns: [
      "/governance/",
      "/national-team/",
      "/selection",
      "/about/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "bylaws",
      "policy",
      "procedure",
      "code",
    ],
    topicDomains: [
      "team_selection",
      "eligibility",
      "governance",
      "athlete_rights",
    ],
    keywords: [
      "USA Diving",
      "diving",
      "Olympic trials",
      "national team",
      "selection criteria",
      "qualification",
    ],
  },
  {
    ngbId: "us-soccer",
    displayName: "US Soccer",
    domain: "ussoccer.com",
    urlPatterns: [
      "/governance/",
      "/about/",
      "/policies",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: ["bylaws", "policy", "procedure", "code", "constitution"],
    topicDomains: ["governance", "eligibility", "athlete_rights", "safesport"],
    keywords: [
      "US Soccer",
      "soccer",
      "football",
      "governance",
      "policies",
      "athlete eligibility",
    ],
  },
  {
    ngbId: "usa-tennis",
    displayName: "USA Tennis",
    domain: "usta.com",
    urlPatterns: [
      "/about/",
      "/governance/",
      "/olympic/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "bylaws",
      "policy",
      "procedure",
      "code",
    ],
    topicDomains: [
      "team_selection",
      "eligibility",
      "governance",
      "athlete_rights",
    ],
    keywords: [
      "USTA",
      "tennis",
      "Olympic tennis",
      "selection criteria",
      "national team",
      "athlete eligibility",
    ],
  },
  {
    ngbId: "usa-triathlon",
    displayName: "USA Triathlon",
    domain: "usatriathlon.org",
    urlPatterns: [
      "/about/",
      "/rules/",
      "/elite-competitive/",
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
      "USA Triathlon",
      "triathlon",
      "Olympic qualification",
      "elite selection",
      "national team",
      "athlete eligibility",
    ],
  },
  {
    ngbId: "us-ski-snowboard",
    displayName: "US Ski & Snowboard",
    domain: "usskiandsnowboard.org",
    urlPatterns: [
      "/governance/",
      "/sport/",
      "/teams/",
      "/about/",
      "/leadership",
      "/contact",
      "/staff",
      "/board",
    ],
    documentTypes: [
      "selection_procedures",
      "bylaws",
      "policy",
      "procedure",
      "code",
    ],
    topicDomains: [
      "team_selection",
      "eligibility",
      "governance",
      "athlete_rights",
      "athlete_safety",
    ],
    keywords: [
      "US Ski & Snowboard",
      "skiing",
      "snowboarding",
      "alpine",
      "freestyle",
      "cross-country",
      "national team",
      "selection criteria",
    ],
  },
  {
    ngbId: "usa-weightlifting",
    displayName: "USA Weightlifting",
    domain: "usaweightlifting.org",
    urlPatterns: [
      "/governance/",
      "/selection/",
      "/rules/",
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
      "USA Weightlifting",
      "weightlifting",
      "Olympic qualification",
      "weight classes",
      "national team",
      "selection criteria",
    ],
  },
  {
    ngbId: "usa-judo",
    displayName: "USA Judo",
    domain: "usajudo.com",
    urlPatterns: [
      "/governance/",
      "/selection/",
      "/rules/",
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
    ],
    keywords: [
      "USA Judo",
      "judo",
      "Olympic qualification",
      "weight classes",
      "national team",
      "selection criteria",
    ],
  },
  {
    ngbId: "usa-boxing",
    displayName: "USA Boxing",
    domain: "usaboxing.org",
    urlPatterns: [
      "/governance/",
      "/selection/",
      "/rules/",
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
      "athlete_safety",
    ],
    keywords: [
      "USA Boxing",
      "boxing",
      "Olympic qualification",
      "weight classes",
      "national team",
      "selection criteria",
      "athlete safety",
    ],
  },
  {
    ngbId: "usa-taekwondo",
    displayName: "USA Taekwondo",
    domain: "teamusa.org",
    urlPatterns: [
      "/USA-Taekwondo/",
      "/governance/",
      "/selection/",
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
    ],
    keywords: [
      "USA Taekwondo",
      "taekwondo",
      "Olympic qualification",
      "weight classes",
      "national team",
      "selection criteria",
    ],
  },
  {
    ngbId: "us-figure-skating",
    displayName: "US Figure Skating",
    domain: "usfigureskating.org",
    urlPatterns: [
      "/about/",
      "/rules/",
      "/competitions/",
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
    ],
    keywords: [
      "US Figure Skating",
      "figure skating",
      "Olympic selection",
      "national championships",
      "national team",
      "selection criteria",
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
      "Paralympic classification",
      "IPC classification",
      "disability accommodation",
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
      "Paralympic athlete rights",
      "disability representation",
    ],
  },
  {
    domain: "athlete_safety",
    keywords: [
      "athlete safety",
      "concussion protocol",
      "injury prevention",
      "training environment safety",
      "travel safety",
      "event safety",
    ],
  },
  {
    domain: "financial_assistance",
    keywords: [
      "financial support",
      "athlete stipend",
      "training grant",
      "travel reimbursement",
      "athlete benefits",
      "funding eligibility",
      "direct athlete support",
      "Operation Gold",
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
