import {
  getResource,
  getSecretValue,
  normalizeUrl,
  logger,
  createQueueService,
} from "@usopc/shared";
import type { DiscoveryFeedMessage } from "@usopc/core";
import { tavily } from "@tavily/core";
import discoveryConfig from "../../../../data/discovery-config.json";

const log = logger.child({ service: "discovery-trigger" });
const queue = createQueueService();

const CONCURRENCY = 10;

export interface DiscoveryStats {
  discovered: number;
  enqueued: number;
  skipped: number;
  errors: number;
}

export async function runDiscovery(): Promise<DiscoveryStats> {
  const apiKey = getSecretValue("TAVILY_API_KEY");
  const client = tavily({ apiKey });
  const queueUrl = getResource("DiscoveryFeedQueue").url;
  const seenUrls = new Set<string>();
  const stats: DiscoveryStats = {
    discovered: 0,
    enqueued: 0,
    skipped: 0,
    errors: 0,
  };
  const runTimestamp = new Date().toISOString();
  const pendingMessages: DiscoveryFeedMessage[] = [];

  // Discover from domains via Tavily Map (bounded concurrency)
  await runBatched(discoveryConfig.domains, CONCURRENCY, async (domain) => {
    try {
      const response = await client.map(`https://${domain}`, {
        limit: discoveryConfig.maxResultsPerDomain,
      });
      const urls = dedup(
        response.results.map((url: string) => ({
          url: normalizeUrl(url),
          title: extractTitle(url),
          discoveryMethod: "map" as const,
          discoveredFrom: domain,
        })),
        seenUrls,
        stats,
      );
      stats.discovered += response.results.length;
      if (urls.length > 0) {
        pendingMessages.push({
          urls,
          autoApprovalThreshold: discoveryConfig.autoApprovalThreshold,
          timestamp: runTimestamp,
        });
      }
    } catch (error) {
      log.error(`Discovery error for domain: ${domain}`, {
        error: String(error),
      });
      stats.errors++;
    }
  });

  // Discover from search queries via Tavily Search (bounded concurrency)
  await runBatched(
    discoveryConfig.searchQueries,
    CONCURRENCY,
    async (query) => {
      try {
        const response = await client.search(query, {
          maxResults: discoveryConfig.maxResultsPerQuery,
          includeDomains: discoveryConfig.domains,
        });
        const urls = dedup(
          response.results.map((r: { url: string; title?: string }) => ({
            url: normalizeUrl(r.url),
            title: r.title || extractTitle(r.url),
            discoveryMethod: "search" as const,
            discoveredFrom: query,
          })),
          seenUrls,
          stats,
        );
        stats.discovered += response.results.length;
        if (urls.length > 0) {
          pendingMessages.push({
            urls,
            autoApprovalThreshold: discoveryConfig.autoApprovalThreshold,
            timestamp: runTimestamp,
          });
        }
      } catch (error) {
        log.error(`Discovery error for query: ${query}`, {
          error: String(error),
        });
        stats.errors++;
      }
    },
  );

  // Batch-send all messages to queue (10 per batch)
  for (let i = 0; i < pendingMessages.length; i += 10) {
    const batch = pendingMessages.slice(i, i + 10);
    await queue.sendMessageBatch(
      queueUrl,
      batch.map((msg, idx) => ({
        id: String(i + idx),
        body: JSON.stringify(msg),
      })),
    );
  }
  for (const msg of pendingMessages) {
    stats.enqueued += msg.urls.length;
  }

  return stats;
}

type DiscoveredURL = {
  url: string;
  title: string;
  discoveryMethod: "map" | "search";
  discoveredFrom: string;
};

function dedup(
  urls: DiscoveredURL[],
  seenUrls: Set<string>,
  stats: DiscoveryStats,
): DiscoveredURL[] {
  return urls.filter((u) => {
    const normalized = normalizeUrl(u.url);
    if (seenUrls.has(normalized)) {
      stats.skipped++;
      return false;
    }
    seenUrls.add(normalized);
    return true;
  });
}

async function runBatched<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.allSettled(
      items.slice(i, i + concurrency).map((item) => fn(item)),
    );
  }
}

function extractTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return parsed.hostname;
    const last = segments[segments.length - 1]!;
    return decodeURIComponent(last)
      .replace(/[-_]/g, " ")
      .replace(/\.[^.]+$/, "")
      .trim();
  } catch {
    return url;
  }
}
