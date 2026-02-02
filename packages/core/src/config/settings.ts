export const RETRIEVAL_CONFIG = {
  topK: 10,
  confidenceThreshold: 0.5,
  narrowFilterTopK: 5,
  broadenFilterTopK: 10,
  chunkSize: 1500,
  chunkOverlap: 200,
} as const;

export const RATE_LIMIT = {
  maxRequestsPerMinute: 60,
  maxTokensPerRequest: 8000,
} as const;

export const TRUSTED_DOMAINS = [
  "usopc.org",
  "teamusa.org",
  "usada.org",
  "safesport.org",
  "uscenterforsafesport.org",
  "tas-cas.org",
  // NGB domains are added dynamically from the registry
] as const;
