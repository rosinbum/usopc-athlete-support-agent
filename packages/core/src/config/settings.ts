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
  "wada-ama.org",
  "safesport.org",
  "uscenterforsafesport.org",
  "olympics.com",
  "paralympic.org",
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
 * Explicit authority overrides for domains that are not international federations.
 * All other TRUSTED_DOMAINS default to `international_rule`.
 */
const DOMAIN_AUTHORITY_OVERRIDES: Record<string, AuthorityLevel> = {
  "usopc.org": "usopc_governance",
  "teamusa.org": "usopc_governance",
  "usada.org": "anti_doping_national",
  "wada-ama.org": "anti_doping_national",
  "safesport.org": "independent_office",
  "uscenterforsafesport.org": "independent_office",
};

/**
 * Maps known domains to their authority level.
 * Derived from {@link TRUSTED_DOMAINS} — domains listed in
 * {@link DOMAIN_AUTHORITY_OVERRIDES} get their explicit level;
 * all others default to `international_rule`.
 */
export const DOMAIN_AUTHORITY_MAP: Record<string, AuthorityLevel> =
  Object.fromEntries(
    TRUSTED_DOMAINS.map((domain) => [
      domain,
      DOMAIN_AUTHORITY_OVERRIDES[domain] ?? "international_rule",
    ]),
  );

/**
 * Returns the authority level for a given URL based on its domain.
 * Strips `www.` prefix and matches against {@link DOMAIN_AUTHORITY_MAP}.
 * Returns `educational_guidance` for unknown domains.
 */
export function getAuthorityForDomain(url: string): AuthorityLevel {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Check exact match first, then try parent domain (e.g., "news.usopc.org" → "usopc.org")
    const exact = DOMAIN_AUTHORITY_MAP[hostname];
    if (exact) return exact;

    const parts = hostname.split(".");
    if (parts.length > 2) {
      const parent = DOMAIN_AUTHORITY_MAP[parts.slice(-2).join(".")];
      if (parent) return parent;
    }
    return "educational_guidance";
  } catch {
    return "educational_guidance";
  }
}
