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
