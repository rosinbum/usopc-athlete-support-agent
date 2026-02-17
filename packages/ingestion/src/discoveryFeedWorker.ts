import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import {
  createLogger,
  getSecretValue,
  DiscoveredSourceEntity,
  createAppTable,
} from "@usopc/shared";
import { normalizeUrl, urlToId } from "@usopc/core";
import type { DiscoveryFeedMessage } from "@usopc/core";
import { Resource } from "sst";
import { EvaluationService } from "./services/evaluationService.js";
import { loadWeb } from "./loaders/index.js";

const logger = createLogger({ service: "discovery-feed-worker" });

const DEFAULT_AUTO_APPROVAL_THRESHOLD = 0.7;

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
        logger.error(`Error processing URL: ${urlEntry.url}`, {
          url: urlEntry.url,
          error: error instanceof Error ? error.message : String(error),
        });
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
      logger.info("Skipping existing discovered URL", {
        url: normalized,
        id,
      });
      return;
    }
    throw error;
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

  if (combinedConfidence >= autoApprovalThreshold) {
    logger.info(`URL auto-approved: ${normalized}`, {
      url: normalized,
      combinedConfidence,
    });
  } else {
    logger.info(`URL rejected after content evaluation: ${normalized}`, {
      url: normalized,
      combinedConfidence,
    });
  }
}
