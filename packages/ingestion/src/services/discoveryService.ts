import { tavily } from "@tavily/core";
import { CircuitBreaker, createLogger } from "@usopc/shared";
import crypto from "crypto";

const logger = createLogger({ service: "discovery-service" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveredURL {
  url: string;
  title: string;
  method: "map" | "search";
  discoveredFrom: string;
}

export interface DiscoveryConfig {
  apiKey: string;
  failureThreshold?: number;
  resetTimeout?: number;
  requestTimeout?: number;
}

// ---------------------------------------------------------------------------
// DiscoveryService
// ---------------------------------------------------------------------------

/**
 * Service for discovering governance documents using Tavily API.
 *
 * Features:
 * - Map endpoint: Crawl domain for governance documents
 * - Search endpoint: Topic-based search with domain filtering
 * - Circuit breaker protection for API resilience
 * - URL normalization and deduplication
 */
export class DiscoveryService {
  private client;
  private circuitBreaker: CircuitBreaker;

  constructor(config: DiscoveryConfig) {
    this.client = tavily({ apiKey: config.apiKey });

    this.circuitBreaker = new CircuitBreaker({
      name: "tavily-api",
      failureThreshold: config.failureThreshold ?? 3,
      resetTimeout: config.resetTimeout ?? 30_000,
      requestTimeout: config.requestTimeout ?? 30_000,
      logger,
    });
  }

  /**
   * Discover URLs from a domain using the Tavily Map endpoint.
   * Crawls the domain for governance-related documents.
   *
   * @param domain - Base domain to crawl (e.g., "usopc.org")
   * @param maxResults - Maximum number of results to return (default: 20)
   * @returns Array of discovered URLs with metadata
   */
  async discoverFromMap(
    domain: string,
    maxResults = 20,
  ): Promise<DiscoveredURL[]> {
    logger.info(`Discovering from map: ${domain}`, { domain, maxResults });

    try {
      const response = await this.circuitBreaker.execute(async () => {
        return await this.client.map(`https://${domain}`, {
          limit: maxResults,
        });
      });

      const urls = this.normalizeMapResults(response.results, domain);
      logger.info(`Discovered ${urls.length} URLs from ${domain}`, {
        domain,
        count: urls.length,
      });

      return urls;
    } catch (error) {
      logger.error(`Error discovering from map: ${domain}`, {
        domain,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Discover URLs using the Tavily Search endpoint.
   * Searches for documents matching a query, optionally scoped to specific domains.
   *
   * @param query - Search query (e.g., "USOPC team selection procedures")
   * @param maxResults - Maximum number of results to return (default: 10)
   * @param includeDomains - Optional array of domains to scope the search
   * @returns Array of discovered URLs with metadata
   */
  async discoverFromSearch(
    query: string,
    maxResults = 10,
    includeDomains?: string[],
  ): Promise<DiscoveredURL[]> {
    logger.info(`Discovering from search: ${query}`, {
      query,
      maxResults,
      includeDomains,
    });

    try {
      const response = await this.circuitBreaker.execute(async () => {
        return await this.client.search(query, {
          maxResults,
          includeDomains,
        });
      });

      const urls = this.normalizeSearchResults(response.results, query);
      logger.info(`Discovered ${urls.length} URLs from search`, {
        query,
        count: urls.length,
      });

      return urls;
    } catch (error) {
      logger.error(`Error discovering from search: ${query}`, {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Normalize and deduplicate map results.
   */
  private normalizeMapResults(
    results: string[],
    domain: string,
  ): DiscoveredURL[] {
    const seen = new Set<string>();
    const normalized: DiscoveredURL[] = [];

    for (const url of results) {
      const normalizedUrl = this.normalizeUrl(url);
      if (seen.has(normalizedUrl)) continue;

      seen.add(normalizedUrl);
      normalized.push({
        url: normalizedUrl,
        title: this.extractTitleFromUrl(normalizedUrl),
        method: "map",
        discoveredFrom: domain,
      });
    }

    return normalized;
  }

  /**
   * Normalize and deduplicate search results.
   */
  private normalizeSearchResults(
    results: Array<{ url: string; title?: string }>,
    query: string,
  ): DiscoveredURL[] {
    const seen = new Set<string>();
    const normalized: DiscoveredURL[] = [];

    for (const result of results) {
      const url = this.normalizeUrl(result.url);
      if (seen.has(url)) continue;

      seen.add(url);
      normalized.push({
        url,
        title: result.title || this.extractTitleFromUrl(url),
        method: "search",
        discoveredFrom: query,
      });
    }

    return normalized;
  }

  /**
   * Normalize URL (remove fragments, trailing slashes, www prefix).
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove fragment and trailing slash
      parsed.hash = "";
      let normalized = parsed.toString().replace(/\/$/, "");
      // Remove www. prefix for deduplication
      normalized = normalized.replace(/^(https?:\/\/)www\./, "$1");
      return normalized;
    } catch {
      // If URL parsing fails, return as-is
      return url;
    }
  }

  /**
   * Extract a reasonable title from the URL path.
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length === 0) return parsed.hostname;

      // Use the last segment, decode and clean it up
      const lastSegment = segments[segments.length - 1];
      return decodeURIComponent(lastSegment)
        .replace(/[-_]/g, " ")
        .replace(/\.[^.]+$/, "") // remove file extension
        .trim();
    } catch {
      return url;
    }
  }

  /**
   * Generate a stable ID for a discovered URL.
   * Uses SHA-256 hash of the normalized URL.
   */
  generateId(url: string): string {
    const normalized = this.normalizeUrl(url);
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Get circuit breaker metrics for monitoring.
   */
  getCircuitBreakerMetrics() {
    return this.circuitBreaker.getMetrics();
  }
}
