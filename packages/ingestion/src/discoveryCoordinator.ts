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

const logger = createLogger({ service: "discovery-coordinator" });

export interface DiscoveryStats {
  discovered: number;
  evaluated: number;
  approved: number;
  rejected: number;
  errors: number;
}

/**
 * Coordinator for the discovery pipeline.
 *
 * Phases:
 * 1. Discovery: Find URLs via Tavily Map/Search
 * 2. Metadata Evaluation: Fast pre-filter
 * 3. Content Extraction: Load web content for relevant URLs
 * 4. Content Evaluation: Deep LLM analysis
 * 5. Storage: Save to DynamoDB with evaluation results
 */
export class DiscoveryCoordinator {
  private discoveryService: DiscoveryService;
  private evaluationService: EvaluationService;
  private discoveredSourceEntity: DiscoveredSourceEntity;
  private config: DiscoveryConfig;

  constructor(config: DiscoveryConfig) {
    this.config = config;

    this.discoveryService = new DiscoveryService({
      apiKey: config.tavilyApiKey,
    });

    this.evaluationService = new EvaluationService({
      anthropicApiKey: config.anthropicApiKey,
    });

    const table = createAppTable(Resource.AppTable.name);
    this.discoveredSourceEntity = new DiscoveredSourceEntity(table);
  }

  /**
   * Discover and evaluate sources from configured domains.
   */
  async discoverFromDomains(
    domains: string[],
    maxPerDomain: number,
  ): Promise<DiscoveryStats> {
    const stats: DiscoveryStats = {
      discovered: 0,
      evaluated: 0,
      approved: 0,
      rejected: 0,
      errors: 0,
    };

    for (const domain of domains) {
      logger.info(`Discovering from domain: ${domain}`);

      try {
        const urls = await this.discoveryService.discoverFromMap(
          domain,
          maxPerDomain,
        );
        stats.discovered += urls.length;

        // Process each discovered URL
        for (const url of urls) {
          try {
            await this.processDiscoveredURL(url.url, url.title, url.method);
            stats.evaluated++;
          } catch (error) {
            logger.error(`Error processing URL: ${url.url}`, {
              url: url.url,
              error: error instanceof Error ? error.message : String(error),
            });
            stats.errors++;
          }
        }
      } catch (error) {
        logger.error(`Error discovering from domain: ${domain}`, {
          domain,
          error: error instanceof Error ? error.message : String(error),
        });
        stats.errors++;
      }
    }

    logger.info("Discovery complete", {
      discovered: stats.discovered,
      evaluated: stats.evaluated,
      approved: stats.approved,
      rejected: stats.rejected,
      errors: stats.errors,
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
    const stats: DiscoveryStats = {
      discovered: 0,
      evaluated: 0,
      approved: 0,
      rejected: 0,
      errors: 0,
    };

    for (const query of queries) {
      logger.info(`Discovering from search: ${query}`);

      try {
        const urls = await this.discoveryService.discoverFromSearch(
          query,
          maxPerQuery,
          includeDomains,
        );
        stats.discovered += urls.length;

        // Process each discovered URL
        for (const url of urls) {
          try {
            await this.processDiscoveredURL(url.url, url.title, url.method);
            stats.evaluated++;
          } catch (error) {
            logger.error(`Error processing URL: ${url.url}`, {
              url: url.url,
              error: error instanceof Error ? error.message : String(error),
            });
            stats.errors++;
          }
        }
      } catch (error) {
        logger.error(`Error discovering from search: ${query}`, {
          query,
          error: error instanceof Error ? error.message : String(error),
        });
        stats.errors++;
      }
    }

    logger.info("Discovery complete", {
      discovered: stats.discovered,
      evaluated: stats.evaluated,
      approved: stats.approved,
      rejected: stats.rejected,
      errors: stats.errors,
    });
    return stats;
  }

  /**
   * Process a single discovered URL through the evaluation pipeline.
   */
  private async processDiscoveredURL(
    url: string,
    title: string,
    method: "map" | "search",
  ): Promise<void> {
    const id = this.discoveryService.generateId(url);
    const domain = new URL(url).hostname;

    // Check if already discovered
    const existing = await this.discoveredSourceEntity.getById(id);
    if (existing) {
      logger.debug(`URL already discovered, skipping: ${url}`, { url, id });
      return;
    }

    // Create discovered source record
    await this.discoveredSourceEntity.create({
      id,
      url,
      title,
      discoveryMethod: method,
      discoveredFrom: domain,
    });

    // Step 1: Metadata evaluation
    const metadataEval = await this.evaluationService.evaluateMetadata(
      url,
      title,
      domain,
    );

    await this.discoveredSourceEntity.markMetadataEvaluated(
      id,
      metadataEval.confidence,
      metadataEval.reasoning,
      metadataEval.suggestedTopicDomains,
      metadataEval.preliminaryDocumentType,
    );

    // If not relevant, reject and stop
    if (!metadataEval.isRelevant || metadataEval.confidence < 0.5) {
      logger.info(`URL rejected after metadata evaluation: ${url}`, {
        url,
        confidence: metadataEval.confidence,
      });
      return;
    }

    // Step 2: Content extraction
    logger.info(`Extracting content from: ${url}`, { url });
    const documents = await loadWeb(url);
    const fullText = documents.map((doc) => doc.pageContent).join("\n");

    // Step 3: Content evaluation
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

    if (combinedConfidence >= this.config.autoApprovalThreshold) {
      logger.info(`URL auto-approved: ${url}`, {
        url,
        combinedConfidence,
      });
    } else {
      logger.info(`URL rejected after content evaluation: ${url}`, {
        url,
        combinedConfidence,
      });
    }
  }
}

/**
 * Factory function to create a DiscoveryCoordinator with secrets loaded from SST.
 */
export function createDiscoveryCoordinator(
  config: Omit<DiscoveryConfig, "tavilyApiKey" | "anthropicApiKey">,
): DiscoveryCoordinator {
  const tavilyApiKey = Resource.TavilyApiKey.value;
  const anthropicApiKey = Resource.AnthropicApiKey.value;

  return new DiscoveryCoordinator({
    ...config,
    tavilyApiKey,
    anthropicApiKey,
  });
}
