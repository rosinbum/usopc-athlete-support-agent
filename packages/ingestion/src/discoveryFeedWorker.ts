import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  createLogger,
  getSecretValue,
  getResource,
  DiscoveredSourceEntity,
  REPROCESSABLE_STATUSES,
  createAppTable,
  normalizeUrl,
  urlToId,
  sendDiscoveryToSources,
  type DiscoveredSource,
} from "@usopc/shared";
import type { DiscoveryFeedMessage } from "@usopc/core";
import { Resource } from "sst";
import { EvaluationService } from "./services/evaluationService.js";
import { loadWeb } from "./loaders/webLoader.js";
import { createSourceConfigEntity } from "./entities/index.js";
import { toIngestionSource } from "./cron.js";

const logger = createLogger({ service: "discovery-feed-worker" });

const DEFAULT_AUTO_APPROVAL_THRESHOLD = 0.7;
const MAX_EXTRACTION_ERRORS = 3;

/**
 * SQS-triggered Lambda handler that processes discovered URLs through the
 * full evaluation pipeline: metadata eval → content extraction → content eval.
 *
 * Each SQS message contains an array of URLs. Individual URL failures don't
 * block others. Only catastrophic errors (invalid JSON) report batch item failures.
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  const anthropicApiKey = getSecretValue(
    "ANTHROPIC_API_KEY",
    "AnthropicApiKey",
  );
  const evaluationService = new EvaluationService({ anthropicApiKey });
  const table = createAppTable(Resource.AppTable.name);
  const entity = new DiscoveredSourceEntity(table);

  for (const record of event.Records) {
    let message: DiscoveryFeedMessage;
    try {
      message = JSON.parse(record.body);
    } catch {
      logger.warn(
        `Skipping malformed message ${record.messageId}: invalid JSON`,
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

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
        // Record error on DDB item so it's visible in admin UI
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

  return { batchItemFailures };
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
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("Conditional")) {
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
  // Build a DiscoveredSource from data already in scope (avoids DynamoDB read)
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
      const sqs = new SQSClient({});
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            source: toIngestionSource(result.sourceConfig),
            triggeredAt: new Date().toISOString(),
          }),
          MessageGroupId: "ingestion",
        }),
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
