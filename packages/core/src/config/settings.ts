import type { AuthorityLevel } from "@usopc/shared";

export const RETRIEVAL_CONFIG = {
  topK: 10,
  confidenceThreshold: 0.5,
  grayZoneUpperThreshold: 0.75,
  narrowFilterTopK: 5,
  broadenFilterTopK: 10,
  chunkSize: 1500,
  chunkOverlap: 200,
} as const;

export const RATE_LIMIT = {
  maxRequestsPerMinute: 60,
  maxTokensPerRequest: 8000,
} as const;

export const GRAPH_CONFIG = {
  /** Maximum time (ms) for a full graph.invoke() call. */
  invokeTimeoutMs: 90_000,
  /** Maximum time (ms) for streaming graph execution. */
  streamTimeoutMs: 120_000,
  /** Maximum graph recursion depth. ~15 node visits worst-case; 30 provides headroom. */
  recursionLimit: 30,
} as const;

export const TRUSTED_DOMAINS = [
  "usopc.org",
  "teamusa.org",
  "usada.org",
  "safesport.org",
  "uscenterforsafesport.org",
  "tas-cas.org",
  // Summer Olympic international federation domains
  "worldaquatics.com",
  "worldathletics.org",
  "gymnastics.sport",
  "triathlon.org",
  "worldrowing.com",
  "canoeicf.com",
  "ijf.org",
  "worldtaekwondo.org",
  "fie.org",
  "issf-sports.org",
  "iwf.sport",
  "uww.org",
  "worldarchery.sport",
  "sailing.org",
  "uci.org",
  "fei.org",
  "ifsc-climbing.org",
  "bwf.sport",
  "fiba.basketball",
  "iba.sport",
  "fifa.com",
  "igfgolf.org",
  "ihf.info",
  "fih.hockey",
  "uipm.org",
  "world.rugby",
  "worldskate.org",
  "isasurf.org",
  "ittf.com",
  "itf-tennis.com",
  "fivb.com",
  "worlddancesport.org",
  "wbsc.org",
  // Winter Olympic international federation domains
  "fis-ski.com",
  "isu.org",
  "biathlonworld.com",
  "ibsf.org",
  "fil-luge.org",
  "worldcurling.org",
  "iihf.com",
  // NGB domains are added dynamically from the registry
] as const;

export const QUALITY_CHECKER_CONFIG = {
  passThreshold: 0.6,
  maxRetries: 1,
} as const;

/**
 * Maps known domains to their authority level.
 * Used to assign authority scores to web search results.
 */
export const DOMAIN_AUTHORITY_MAP: Record<string, AuthorityLevel> = {
  // USOPC governance
  "usopc.org": "usopc_governance",
  "teamusa.org": "usopc_governance",
  // Anti-doping
  "usada.org": "anti_doping_national",
  "wada-ama.org": "anti_doping_national",
  // Independent offices
  "safesport.org": "independent_office",
  "uscenterforsafesport.org": "independent_office",
  // International rules — Olympic/Paralympic bodies
  "olympics.com": "international_rule",
  "paralympic.org": "international_rule",
  "tas-cas.org": "international_rule",
  // International federations (Summer)
  "worldaquatics.com": "international_rule",
  "worldathletics.org": "international_rule",
  "gymnastics.sport": "international_rule",
  "triathlon.org": "international_rule",
  "worldrowing.com": "international_rule",
  "canoeicf.com": "international_rule",
  "ijf.org": "international_rule",
  "worldtaekwondo.org": "international_rule",
  "fie.org": "international_rule",
  "issf-sports.org": "international_rule",
  "iwf.sport": "international_rule",
  "uww.org": "international_rule",
  "worldarchery.sport": "international_rule",
  "sailing.org": "international_rule",
  "uci.org": "international_rule",
  "fei.org": "international_rule",
  "ifsc-climbing.org": "international_rule",
  "bwf.sport": "international_rule",
  "fiba.basketball": "international_rule",
  "iba.sport": "international_rule",
  "fifa.com": "international_rule",
  "igfgolf.org": "international_rule",
  "ihf.info": "international_rule",
  "fih.hockey": "international_rule",
  "uipm.org": "international_rule",
  "world.rugby": "international_rule",
  "worldskate.org": "international_rule",
  "isasurf.org": "international_rule",
  "ittf.com": "international_rule",
  "itf-tennis.com": "international_rule",
  "fivb.com": "international_rule",
  "worlddancesport.org": "international_rule",
  "wbsc.org": "international_rule",
  // International federations (Winter)
  "fis-ski.com": "international_rule",
  "isu.org": "international_rule",
  "biathlonworld.com": "international_rule",
  "ibsf.org": "international_rule",
  "fil-luge.org": "international_rule",
  "worldcurling.org": "international_rule",
  "iihf.com": "international_rule",
};

/**
 * Returns the authority level for a given URL based on its domain.
 * Strips `www.` prefix and matches against {@link DOMAIN_AUTHORITY_MAP}.
 * Returns `educational_guidance` for unknown domains.
 */
export function getAuthorityForDomain(url: string): AuthorityLevel {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Check exact match first, then try parent domain (e.g., "news.usopc.org" → "usopc.org")
    if (DOMAIN_AUTHORITY_MAP[hostname]) {
      return DOMAIN_AUTHORITY_MAP[hostname];
    }
    // Try parent domain for subdomains
    const parts = hostname.split(".");
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join(".");
      if (DOMAIN_AUTHORITY_MAP[parentDomain]) {
        return DOMAIN_AUTHORITY_MAP[parentDomain];
      }
    }
    return "educational_guidance";
  } catch {
    return "educational_guidance";
  }
}
