import { createHash } from "node:crypto";
import { createAppTable, DiscoveredSourceEntity, logger } from "@usopc/shared";
import type { WebSearchResult } from "../types/index.js";

const log = logger.child({ service: "discovery-feed" });

/**
 * Normalizes a URL for deduplication:
 * - Strips fragment (#...)
 * - Strips trailing slash
 * - Strips www. prefix from host
 */
export function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    // Strip www. prefix
    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    let normalized = parsed.toString();
    // Strip trailing slash (but not for root "/")
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    // If URL parsing fails, return as-is
    return raw;
  }
}

/**
 * Generates a deterministic SHA-256 ID from a normalized URL.
 */
function urlToId(normalizedUrl: string): string {
  return createHash("sha256").update(normalizedUrl).digest("hex");
}

/**
 * Persists discovered URLs from the researcher's web search results
 * into the DiscoveredSource DynamoDB table for the ingestion pipeline.
 *
 * - Normalizes URLs for consistent dedup
 * - Skips URLs that already exist in the table
 * - Creates entries with discoveryMethod: "agent"
 * - Uses Tavily's relevance score as metadataConfidence (skips LLM eval)
 * - Score >= 0.5 → pending_content; < 0.5 → rejected
 * - Individual failures don't block other URLs
 * - Never throws — logs all operations
 */
export async function persistDiscoveredUrls(
  results: WebSearchResult[],
  tableName: string,
): Promise<{ persisted: number; skipped: number }> {
  if (results.length === 0) {
    return { persisted: 0, skipped: 0 };
  }

  const table = createAppTable(tableName);
  const entity = new DiscoveredSourceEntity(table);
  let persisted = 0;
  let skipped = 0;

  for (const result of results) {
    try {
      const normalized = normalizeUrl(result.url);
      const id = urlToId(normalized);

      // Dedup check
      const existing = await entity.getById(id);
      if (existing) {
        log.info("Skipping existing discovered URL", {
          url: normalized,
          id,
        });
        skipped++;
        continue;
      }

      await entity.create({
        id,
        url: normalized,
        title: result.title,
        discoveryMethod: "agent",
        discoveredFrom: "agent-web-search",
      });

      // Use Tavily relevance score as metadata confidence, skipping the
      // LLM metadata evaluation step entirely. markMetadataEvaluated
      // handles the status transition: >= 0.5 → pending_content, < 0.5 → rejected.
      await entity.markMetadataEvaluated(
        id,
        result.score,
        "Auto-scored from Tavily relevance (agent web search)",
        [],
        "",
      );

      log.info("Persisted discovered URL", {
        url: normalized,
        id,
        tavilyScore: result.score,
      });
      persisted++;
    } catch (error) {
      log.error("Failed to persist discovered URL", {
        url: result.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info("Discovery feed complete", { persisted, skipped });
  return { persisted, skipped };
}
