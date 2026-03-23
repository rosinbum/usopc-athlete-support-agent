import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  getResource,
  getSecretValue,
  normalizeUrl,
  logger,
} from "@usopc/shared";
import type { DiscoveryFeedMessage } from "@usopc/core";
import { tavily } from "@tavily/core";
import discoveryConfig from "../../../../data/discovery-config.json";

const log = logger.child({ service: "discovery-trigger" });

export interface DiscoveryStats {
  discovered: number;
  enqueued: number;
  skipped: number;
  errors: number;
}

export async function runDiscovery(): Promise<DiscoveryStats> {
  const apiKey = getSecretValue("TAVILY_API_KEY", "TavilyApiKey");
  const client = tavily({ apiKey });
  const queueUrl = getResource("DiscoveryFeedQueue").url;
  const sqs = new SQSClient({});
  const seenUrls = new Set<string>();
  const stats: DiscoveryStats = {
    discovered: 0,
    enqueued: 0,
    skipped: 0,
    errors: 0,
  };

  // Discover from domains via Tavily Map
  for (const domain of discoveryConfig.domains) {
    try {
      const response = await client.map(`https://${domain}`, {
        limit: discoveryConfig.maxResultsPerDomain,
      });
      const urls = response.results.map((url: string) => ({
        url: normalizeUrl(url),
        title: extractTitle(url),
        discoveryMethod: "map" as const,
        discoveredFrom: domain,
      }));
      stats.discovered += urls.length;
      await enqueueUrls(
        sqs,
        queueUrl,
        urls,
        seenUrls,
        stats,
        discoveryConfig.autoApprovalThreshold,
      );
    } catch (error) {
      log.error(`Discovery error for domain: ${domain}`, {
        error: String(error),
      });
      stats.errors++;
    }
  }

  // Discover from search queries via Tavily Search
  for (const query of discoveryConfig.searchQueries) {
    try {
      const response = await client.search(query, {
        maxResults: discoveryConfig.maxResultsPerQuery,
        includeDomains: discoveryConfig.domains,
      });
      const urls = response.results.map(
        (r: { url: string; title?: string }) => ({
          url: normalizeUrl(r.url),
          title: r.title || extractTitle(r.url),
          discoveryMethod: "search" as const,
          discoveredFrom: query,
        }),
      );
      stats.discovered += urls.length;
      await enqueueUrls(
        sqs,
        queueUrl,
        urls,
        seenUrls,
        stats,
        discoveryConfig.autoApprovalThreshold,
      );
    } catch (error) {
      log.error(`Discovery error for query: ${query}`, {
        error: String(error),
      });
      stats.errors++;
    }
  }

  return stats;
}

async function enqueueUrls(
  sqs: SQSClient,
  queueUrl: string,
  urls: Array<{
    url: string;
    title: string;
    discoveryMethod: "map" | "search";
    discoveredFrom: string;
  }>,
  seenUrls: Set<string>,
  stats: DiscoveryStats,
  autoApprovalThreshold: number,
): Promise<void> {
  const newUrls = urls.filter((u) => {
    if (seenUrls.has(u.url)) {
      stats.skipped++;
      return false;
    }
    seenUrls.add(u.url);
    return true;
  });

  if (newUrls.length === 0) return;

  const message: DiscoveryFeedMessage = {
    urls: newUrls,
    autoApprovalThreshold,
    timestamp: new Date().toISOString(),
  };

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
    }),
  );

  stats.enqueued += newUrls.length;
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
