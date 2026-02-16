import {
  createLogger,
  createAppTable,
  DiscoveredSourceEntity,
} from "@usopc/shared";
import { Resource } from "sst";
import { DiscoveryService } from "./services/discoveryService.js";
import { EvaluationService } from "./services/evaluationService.js";
import { loadWeb } from "./loaders/index.js";
import type { DiscoveryConfig } from "./types.js";

const logger = createLogger({ service: "discovery-orchestrator" });

export interface DiscoveryStats {
  discovered: number;
  evaluated: number;
  approved: number;
  rejected: number;
  errors: number;
  skipped: number;
}

export interface OrchestratorConfig extends DiscoveryConfig {
  /**
   * Maximum number of URLs to process concurrently.
   * @default 3
   */
  concurrency?: number;
  /**
   * Dry run mode: evaluate URLs but don't save to DynamoDB.
   * @default false
   */
  dryRun?: boolean;
  /**
   * Progress callback for real-time updates.
   */
  onProgress?: (stats: DiscoveryStats) => void;
}

/**
 * Orchestrates the intelligent source discovery pipeline.
 *
 * Features:
 * - Progress tracking with stats aggregation
 * - Batch processing with configurable concurrency
 * - Error recovery: failures don't stop the pipeline
 * - Context hints integration for improved evaluation
 * - Dry run mode for testing
 *
 * Phases:
 * 1. Discovery: Find URLs via Tavily Map/Search
 * 2. Metadata Evaluation: Fast pre-filter with context hints
 * 3. Content Extraction: Load web content for relevant URLs
 * 4. Content Evaluation: Deep LLM analysis with context hints
 * 5. Storage: Save to DynamoDB with evaluation results (unless dry run)
 */
export class DiscoveryOrchestrator {
  private discoveryService: DiscoveryService;
  private evaluationService: EvaluationService;
  private discoveredSourceEntity: DiscoveredSourceEntity;
  private config: OrchestratorConfig;
  private stats: DiscoveryStats;

  constructor(config: OrchestratorConfig) {
    this.config = {
      concurrency: 3,
      dryRun: false,
      ...config,
    };

    this.discoveryService = new DiscoveryService({
      apiKey: config.tavilyApiKey,
    });

    this.evaluationService = new EvaluationService({
      anthropicApiKey: config.anthropicApiKey,
    });

    // @ts-expect-error - AppTable exists at runtime from SST
    const table = createAppTable(Resource.AppTable.name);
    this.discoveredSourceEntity = new DiscoveredSourceEntity(table);

    this.stats = {
      discovered: 0,
      evaluated: 0,
      approved: 0,
      rejected: 0,
      errors: 0,
      skipped: 0,
    };
  }

  /**
   * Get current discovery statistics.
   */
  getStats(): DiscoveryStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics to zero.
   */
  resetStats(): void {
    this.stats = {
      discovered: 0,
      evaluated: 0,
      approved: 0,
      rejected: 0,
      errors: 0,
      skipped: 0,
    };
  }

  /**
   * Discover and evaluate sources from configured domains.
   */
  async discoverFromDomains(
    domains: string[],
    maxPerDomain: number,
  ): Promise<DiscoveryStats> {
    logger.info("Starting domain discovery", {
      domains: domains.length,
      maxPerDomain,
      concurrency: this.config.concurrency,
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

        // Process URLs in batches with concurrency control
        await this.processBatch(
          urls.map((u) => ({
            url: u.url,
            title: u.title,
            method: u.method,
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
    logger.info("Domain discovery complete", {
      discovered: stats.discovered,
      evaluated: stats.evaluated,
      approved: stats.approved,
      rejected: stats.rejected,
      errors: stats.errors,
      skipped: stats.skipped,
    });
    return stats;
  }

  /**
   * Discover and evaluate sources from search queries.
   */
  async discoverFromSearchQueries(
    queries: string[],
    maxPerQuery: number,
    includeDomains?: string[],
  ): Promise<DiscoveryStats> {
    logger.info("Starting search query discovery", {
      queries: queries.length,
      maxPerQuery,
      concurrency: this.config.concurrency,
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

        // Process URLs in batches with concurrency control
        await this.processBatch(
          urls.map((u) => ({
            url: u.url,
            title: u.title,
            method: u.method,
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
    logger.info("Search query discovery complete", {
      discovered: stats.discovered,
      evaluated: stats.evaluated,
      approved: stats.approved,
      rejected: stats.rejected,
      errors: stats.errors,
      skipped: stats.skipped,
    });
    return stats;
  }

  /**
   * Process a batch of URLs with concurrency control.
   */
  private async processBatch(
    urls: Array<{ url: string; title: string; method: "map" | "search" }>,
  ): Promise<void> {
    const concurrency = this.config.concurrency ?? 3;
    const batches: (typeof urls)[] = [];

    // Split into batches
    for (let i = 0; i < urls.length; i += concurrency) {
      batches.push(urls.slice(i, i + concurrency));
    }

    // Process each batch
    for (const batch of batches) {
      await Promise.all(
        batch.map(async ({ url, title, method }) => {
          try {
            const result = await this.processDiscoveredURL(url, title, method);
            if (result === "evaluated") {
              this.stats.evaluated++;
            } else if (result === "approved") {
              this.stats.evaluated++;
              this.stats.approved++;
            } else if (result === "rejected") {
              this.stats.evaluated++;
              this.stats.rejected++;
            } else if (result === "skipped") {
              this.stats.skipped++;
            }
            this.notifyProgress();
          } catch (error) {
            logger.error(`Error processing URL: ${url}`, {
              url,
              error: error instanceof Error ? error.message : String(error),
            });
            this.stats.errors++;
            this.notifyProgress();
          }
        }),
      );
    }
  }

  /**
   * Process a single discovered URL through the evaluation pipeline.
   *
   * @returns "evaluated" | "approved" | "rejected" | "skipped"
   */
  private async processDiscoveredURL(
    url: string,
    title: string,
    method: "map" | "search",
  ): Promise<"evaluated" | "approved" | "rejected" | "skipped"> {
    const id = this.discoveryService.generateId(url);
    const domain = new URL(url).hostname;

    // Check if already discovered (skip in dry run mode)
    if (!this.config.dryRun) {
      const existing = await this.discoveredSourceEntity.getById(id);
      if (existing) {
        logger.debug(`URL already discovered, skipping: ${url}`, { url, id });
        return "skipped";
      }
    }

    // Create discovered source record (skip in dry run mode)
    if (!this.config.dryRun) {
      await this.discoveredSourceEntity.create({
        id,
        url,
        title,
        discoveryMethod: method,
        discoveredFrom: domain,
      });
    } else {
      logger.debug(`[DRY RUN] Would create discovered source: ${url}`, {
        url,
        id,
      });
    }

    // Step 1: Metadata evaluation (with context hints)
    const metadataEval = await this.evaluationService.evaluateMetadata(
      url,
      title,
      domain,
    );

    if (!this.config.dryRun) {
      await this.discoveredSourceEntity.markMetadataEvaluated(
        id,
        metadataEval.confidence,
        metadataEval.reasoning,
        metadataEval.suggestedTopicDomains,
        metadataEval.preliminaryDocumentType,
      );
    } else {
      logger.debug(`[DRY RUN] Metadata evaluation: ${url}`, {
        url,
        confidence: metadataEval.confidence,
        isRelevant: metadataEval.isRelevant,
      });
    }

    // If not relevant, reject and stop
    if (!metadataEval.isRelevant || metadataEval.confidence < 0.5) {
      logger.info(`URL rejected after metadata evaluation: ${url}`, {
        url,
        confidence: metadataEval.confidence,
      });
      return "rejected";
    }

    // Step 2: Content extraction
    logger.info(`Extracting content from: ${url}`, { url });
    const documents = await loadWeb(url);
    const fullText = documents.map((doc) => doc.pageContent).join("\n");

    // Step 3: Content evaluation (with context hints)
    const contentEval = await this.evaluationService.evaluateContent(
      url,
      title,
      fullText,
    );

    const combinedConfidence =
      this.evaluationService.calculateCombinedConfidence(
        metadataEval.confidence,
        contentEval.confidence,
      );

    // Determine format from URL
    const format = url.endsWith(".pdf")
      ? "pdf"
      : url.endsWith(".txt")
        ? "text"
        : "html";

    if (!this.config.dryRun) {
      await this.discoveredSourceEntity.markContentEvaluated(
        id,
        contentEval.confidence,
        combinedConfidence,
        {
          documentType: contentEval.documentType,
          topicDomains: contentEval.topicDomains,
          authorityLevel: contentEval.authorityLevel,
          priority: contentEval.priority,
          description: contentEval.description,
          ngbId: contentEval.ngbId,
          format,
        },
        contentEval.description,
        this.config.autoApprovalThreshold,
      );
    } else {
      logger.debug(`[DRY RUN] Content evaluation: ${url}`, {
        url,
        confidence: contentEval.confidence,
        combinedConfidence,
        approved: combinedConfidence >= this.config.autoApprovalThreshold,
      });
    }

    if (combinedConfidence >= this.config.autoApprovalThreshold) {
      logger.info(`URL auto-approved: ${url}`, {
        url,
        combinedConfidence,
      });
      return "approved";
    } else {
      logger.info(`URL rejected after content evaluation: ${url}`, {
        url,
        combinedConfidence,
      });
      return "rejected";
    }
  }

  /**
   * Notify progress callback if configured.
   */
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
  config: Omit<OrchestratorConfig, "tavilyApiKey" | "anthropicApiKey">,
): DiscoveryOrchestrator {
  const tavilyApiKey = Resource.TavilyApiKey.value;
  const anthropicApiKey = Resource.AnthropicApiKey.value;

  return new DiscoveryOrchestrator({
    ...config,
    tavilyApiKey,
    anthropicApiKey,
  });
}
