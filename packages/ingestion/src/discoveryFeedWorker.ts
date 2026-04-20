import {
  createLogger,
  getSecretValue,
  getResource,
  createQueueService,
  REPROCESSABLE_STATUSES,
  normalizeUrl,
  urlToId,
  sendDiscoveryToSources,
  createDiscoveredSourceEntity,
  type DiscoveredSourceEntity,
  type DiscoveredSource,
} from "@usopc/shared";
import type { DiscoveryFeedMessage } from "@usopc/core";
import { EvaluationService } from "./services/evaluationService.js";
import { loadWeb } from "./loaders/webLoader.js";
import { createSourceConfigEntity } from "./entities/index.js";
import { toIngestionSource } from "./cron.js";

const logger = createLogger({ service: "discovery-feed-worker" });

const DEFAULT_AUTO_APPROVAL_THRESHOLD = 0.7;
const MAX_EXTRACTION_ERRORS = 3;

/**
 * Process a discovery feed message containing URLs to evaluate.
 *
 * Each message contains an array of URLs. Individual URL failures don't
 * block others — errors are recorded on the discovered source entry.
 */
export async function handleDiscoveryFeedMessage(
  message: DiscoveryFeedMessage,
): Promise<void> {
  const anthropicApiKey = getSecretValue("ANTHROPIC_API_KEY");
  const evaluationService = new EvaluationService({ anthropicApiKey });
  const entity = createDiscoveredSourceEntity();

  const autoApprovalThreshold =
    message.autoApprovalThreshold ?? DEFAULT_AUTO_APPROVAL_THRESHOLD;

  logger.info("Processing discovery feed message", {
    urlCount: message.urls.length,
    autoApprovalThreshold,
  });

  for (const urlEntry of message.urls) {
    try {
      await processUrl(
        urlEntry,
        entity,
        evaluationService,
        autoApprovalThreshold,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing URL: ${urlEntry.url}`, {
        url: urlEntry.url,
        error: errorMsg,
      });
      // Record error so it's visible in admin UI
      try {
        const id = urlToId(normalizeUrl(urlEntry.url));
        const updated = await entity.recordError(id, errorMsg);
        if (updated.errorCount >= MAX_EXTRACTION_ERRORS) {
          logger.warn(
            `Rejecting URL after ${updated.errorCount} extraction errors: ${urlEntry.url}`,
            { url: urlEntry.url, errorCount: updated.errorCount },
          );
          await entity.update(id, {
            status: "rejected",
            rejectionReason: `Permanently failed after ${updated.errorCount} extraction errors: ${errorMsg}`,
          });
        }
      } catch {
        // Don't let error recording crash the loop
      }
    }
  }
}

async function processUrl(
  urlEntry: DiscoveryFeedMessage["urls"][number],
  entity: DiscoveredSourceEntity,
  evaluationService: EvaluationService,
  autoApprovalThreshold: number,
): Promise<void> {
  const normalized = normalizeUrl(urlEntry.url);
  const id = urlToId(normalized);
  const domain = new URL(normalized).hostname;

  // Step 1: Create entry (conditional put for dedup)
  let isReprocess = false;
  try {
    await entity.create({
      id,
      url: normalized,
      title: urlEntry.title,
      discoveryMethod: urlEntry.discoveryMethod,
      discoveredFrom: urlEntry.discoveredFrom,
    });
  } catch (error) {
    // Postgres unique-violation on discovered_sources.id: the URL already
    // exists. `pg` surfaces SQLSTATE 23505 on the error object's `code`.
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      // Check if the existing record is stuck and should be re-evaluated
      const existing = await entity.getById(id);
      if (existing && REPROCESSABLE_STATUSES.has(existing.status)) {
        logger.info("Re-evaluating stuck URL", {
          url: normalized,
          id,
          status: existing.status,
        });
        isReprocess = true;
        // Fall through to evaluation pipeline
      } else {
        logger.info("Skipping existing discovered URL", {
          url: normalized,
          id,
        });
        return;
      }
    } else {
      throw error;
    }
  }

  // Step 2: Metadata evaluation
  const metadataEval = await evaluationService.evaluateMetadata(
    normalized,
    urlEntry.title,
    domain,
  );

  await entity.markMetadataEvaluated(
    id,
    metadataEval.confidence,
    metadataEval.reasoning,
    metadataEval.suggestedTopicDomains,
    metadataEval.preliminaryDocumentType,
  );

  // Reject if not relevant or low confidence
  if (!metadataEval.isRelevant || metadataEval.confidence < 0.5) {
    logger.info(`URL rejected after metadata evaluation: ${normalized}`, {
      url: normalized,
      confidence: metadataEval.confidence,
    });
    if (isReprocess) await entity.clearError(id);
    return;
  }

  // Step 3: Content extraction
  logger.info(`Extracting content from: ${normalized}`, { url: normalized });
  const documents = await loadWeb(normalized);
  const fullText = documents.map((doc) => doc.pageContent).join("\n");

  // Step 4: Content evaluation
  const contentEval = await evaluationService.evaluateContent(
    normalized,
    urlEntry.title,
    fullText,
  );

  const combinedConfidence = evaluationService.calculateCombinedConfidence(
    metadataEval.confidence,
    contentEval.confidence,
  );

  // Determine format from URL
  const format = normalized.endsWith(".pdf")
    ? "pdf"
    : normalized.endsWith(".txt")
      ? "text"
      : "html";

  // Step 5: Mark content evaluated (auto-approve/reject)
  await entity.markContentEvaluated(
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
    autoApprovalThreshold,
  );

  if (isReprocess) await entity.clearError(id);

  if (combinedConfidence >= autoApprovalThreshold) {
    logger.info(`URL auto-approved: ${normalized}`, {
      url: normalized,
      combinedConfidence,
    });

    try {
      await promoteAndEnqueue(entity, {
        id,
        url: normalized,
        title: urlEntry.title,
        documentType: contentEval.documentType,
        topicDomains: contentEval.topicDomains,
        authorityLevel: contentEval.authorityLevel,
        priority: contentEval.priority,
        description: contentEval.description,
        ngbId: contentEval.ngbId,
        format,
      });
    } catch (error) {
      // Non-fatal — weekly cron catch-up will handle it
      logger.warn(`Failed to promote auto-approved discovery: ${id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    logger.info(`URL rejected after content evaluation: ${normalized}`, {
      url: normalized,
      combinedConfidence,
    });
  }
}

// ---------------------------------------------------------------------------
// Post-approval promotion
// ---------------------------------------------------------------------------

interface PromoteInput {
  id: string;
  url: string;
  title: string;
  documentType: string;
  topicDomains: string[];
  authorityLevel: string;
  priority: "high" | "medium" | "low";
  description: string;
  ngbId: string | null;
  format: "pdf" | "html" | "text";
}

/**
 * Promote an auto-approved discovery to a SourceConfig and enqueue it for
 * immediate ingestion. Non-fatal — the weekly cron acts as a catch-up.
 */
async function promoteAndEnqueue(
  discoveredSourceEntity: DiscoveredSourceEntity,
  input: PromoteInput,
): Promise<void> {
  // Build a DiscoveredSource from data already in scope (avoids extra database read)
  const discovery: DiscoveredSource = {
    id: input.id,
    url: input.url,
    title: input.title,
    discoveryMethod: "search",
    discoveredAt: new Date().toISOString(),
    discoveredFrom: null,
    status: "approved",
    metadataConfidence: null,
    contentConfidence: null,
    combinedConfidence: null,
    documentType: input.documentType,
    topicDomains: input.topicDomains,
    format: input.format,
    ngbId: input.ngbId,
    priority: input.priority,
    description: input.description,
    authorityLevel: input.authorityLevel,
    metadataReasoning: null,
    contentReasoning: null,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    sourceConfigId: null,
    lastError: null,
    errorCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sourceConfigEntity = createSourceConfigEntity();
  const result = await sendDiscoveryToSources(
    discovery,
    sourceConfigEntity,
    discoveredSourceEntity,
  );

  if (result.status === "created" && result.sourceConfig) {
    try {
      const queueUrl = getResource("IngestionQueue").url;
      const queue = createQueueService();
      await queue.sendMessage(
        queueUrl,
        JSON.stringify({
          source: toIngestionSource(result.sourceConfig),
          triggeredAt: new Date().toISOString(),
        }),
        { groupId: "ingestion" },
      );
      logger.info(
        `Enqueued auto-approved discovery for ingestion: ${input.id}`,
      );
    } catch {
      // IngestionQueue not available (non-prod) — non-fatal
      logger.debug(
        `Skipping ingestion enqueue (queue unavailable): ${input.id}`,
      );
    }
  }
}
