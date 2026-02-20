import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { createLogger, getResource, normalizeUrl } from "@usopc/shared";
import type { DiscoveryFeedMessage } from "@usopc/core";
import { Resource } from "sst";
import { DiscoveryService } from "./services/discoveryService.js";
import { DiscoveryConfig } from "./types.js";

const logger = createLogger({ service: "discovery-orchestrator" });
const sqs = new SQSClient({});

export interface DiscoveryStats {
  discovered: number;
  enqueued: number;
  skipped: number;
  errors: number;
}

export interface OrchestratorConfig extends DiscoveryConfig {
  /**
   * Dry run mode: discover URLs but don't enqueue to SQS.
   * @default false
   */
  dryRun?: boolean | undefined;
  /**
   * Progress callback for real-time updates.
   */
  onProgress?: ((stats: DiscoveryStats) => void) | undefined;
}

/**
 * Orchestrates intelligent source discovery.
 *
 * Discovers URLs via Tavily Map/Search, deduplicates, and publishes
 * to the DiscoveryFeedQueue for async evaluation by the worker Lambda.
 *
 * The evaluation pipeline (metadata eval → content extraction → content eval)
 * is handled entirely by the DiscoveryFeedWorker.
 */
export class DiscoveryOrchestrator {
  private discoveryService: DiscoveryService;
  private config: OrchestratorConfig;
  private stats: DiscoveryStats;
  private seenUrls = new Set<string>();

  constructor(config: OrchestratorConfig) {
    this.config = {
      dryRun: false,
      ...config,
    };

    this.discoveryService = new DiscoveryService({
      apiKey: config.tavilyApiKey,
    });

    this.stats = {
      discovered: 0,
      enqueued: 0,
      skipped: 0,
      errors: 0,
    };
  }

  getStats(): DiscoveryStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { discovered: 0, enqueued: 0, skipped: 0, errors: 0 };
    this.seenUrls.clear();
  }

  async discoverFromDomains(
    domains: string[],
    maxPerDomain: number,
  ): Promise<DiscoveryStats> {
    logger.info("Starting domain discovery", {
      domains: domains.length,
      maxPerDomain,
      dryRun: this.config.dryRun,
    });

    for (const domain of domains) {
      logger.info(`Discovering from domain: ${domain}`);

      try {
        const urls = await this.discoveryService.discoverFromMap(
          domain,
          maxPerDomain,
        );
        this.stats.discovered += urls.length;
        this.notifyProgress();

        await this.enqueueUrls(
          urls.map((u) => ({
            url: u.url,
            title: u.title,
            discoveryMethod: u.method,
            discoveredFrom: domain,
          })),
        );
      } catch (error) {
        logger.error(`Error discovering from domain: ${domain}`, {
          domain,
          error: error instanceof Error ? error.message : String(error),
        });
        this.stats.errors++;
        this.notifyProgress();
      }
    }

    const stats = this.getStats();
    logger.info("Domain discovery complete", { ...stats });
    return stats;
  }

  async discoverFromSearchQueries(
    queries: string[],
    maxPerQuery: number,
    includeDomains?: string[],
  ): Promise<DiscoveryStats> {
    logger.info("Starting search query discovery", {
      queries: queries.length,
      maxPerQuery,
      dryRun: this.config.dryRun,
    });

    for (const query of queries) {
      logger.info(`Discovering from search: ${query}`);

      try {
        const urls = await this.discoveryService.discoverFromSearch(
          query,
          maxPerQuery,
          includeDomains,
        );
        this.stats.discovered += urls.length;
        this.notifyProgress();

        await this.enqueueUrls(
          urls.map((u) => ({
            url: u.url,
            title: u.title,
            discoveryMethod: u.method,
            discoveredFrom: query,
          })),
        );
      } catch (error) {
        logger.error(`Error discovering from search: ${query}`, {
          query,
          error: error instanceof Error ? error.message : String(error),
        });
        this.stats.errors++;
        this.notifyProgress();
      }
    }

    const stats = this.getStats();
    logger.info("Search query discovery complete", { ...stats });
    return stats;
  }

  /**
   * Dedup and enqueue discovered URLs to SQS.
   */
  private async enqueueUrls(
    urls: Array<{
      url: string;
      title: string;
      discoveryMethod: "map" | "search";
      discoveredFrom: string;
    }>,
  ): Promise<void> {
    // Dedup within this run (using normalized URLs for consistency with worker)
    const newUrls = urls.filter((u) => {
      const normalized = normalizeUrl(u.url);
      if (this.seenUrls.has(normalized)) {
        this.stats.skipped++;
        return false;
      }
      this.seenUrls.add(normalized);
      return true;
    });

    if (newUrls.length === 0) {
      this.notifyProgress();
      return;
    }

    if (this.config.dryRun) {
      for (const u of newUrls) {
        logger.debug(`[DRY RUN] Would enqueue: ${u.url}`, { url: u.url });
      }
      this.stats.enqueued += newUrls.length;
      this.notifyProgress();
      return;
    }

    const message: DiscoveryFeedMessage = {
      urls: newUrls.map((u) => ({
        url: u.url,
        title: u.title,
        discoveryMethod: u.discoveryMethod,
        discoveredFrom: u.discoveredFrom,
      })),
      autoApprovalThreshold: this.config.autoApprovalThreshold,
      timestamp: new Date().toISOString(),
    };

    try {
      const queueUrl = getResource("DiscoveryFeedQueue").url;

      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
        }),
      );

      this.stats.enqueued += newUrls.length;
      logger.info(`Enqueued ${newUrls.length} URLs to discovery feed`, {
        count: newUrls.length,
      });
    } catch (error) {
      logger.error("Failed to enqueue URLs to discovery feed", {
        error: error instanceof Error ? error.message : String(error),
        count: newUrls.length,
      });
      this.stats.errors++;
    }
    this.notifyProgress();
  }

  private notifyProgress(): void {
    if (this.config.onProgress) {
      this.config.onProgress(this.getStats());
    }
  }
}

/**
 * Factory function to create a DiscoveryOrchestrator with secrets loaded from SST.
 */
export function createDiscoveryOrchestrator(
  config: Omit<OrchestratorConfig, "tavilyApiKey">,
): DiscoveryOrchestrator {
  const tavilyApiKey = Resource.TavilyApiKey.value;

  return new DiscoveryOrchestrator({
    ...config,
    tavilyApiKey,
  });
}
