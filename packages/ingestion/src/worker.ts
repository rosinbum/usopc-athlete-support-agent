import {
  createLogger,
  getSecretValue,
  getResource,
  createQueueService,
} from "@usopc/shared";
import { QuotaExhaustedError } from "./pipeline.js";
import { upsertIngestionStatus } from "./db.js";
import type { IngestionMessage } from "./cron.js";
import {
  createIngestionLogEntity,
  createSourceConfigEntity,
} from "./entities/index.js";
import { processSource } from "./services/sourceProcessor.js";

const logger = createLogger({ service: "ingestion-worker" });

/**
 * Process a single ingestion message (Pub/Sub push or direct invocation).
 *
 * On QuotaExhaustedError the ingestion queue is purged to prevent further
 * messages from hitting the same billing limit.
 */
export async function handleIngestionMessage(
  message: IngestionMessage,
): Promise<void> {
  const openaiApiKey = getSecretValue("OPENAI_API_KEY");
  const ingestionLogEntity = createIngestionLogEntity();
  const sourceConfigEntity = createSourceConfigEntity();

  try {
    logger.info(`Processing source: ${message.source.id}`, {
      sourceId: message.source.id,
      url: message.source.url,
      triggeredAt: message.triggeredAt,
    });

    const result = await processSource({
      source: message.source,
      openaiApiKey,
      bucketName: getResource("DocumentsBucket").name,
      ingestionLogEntity,
      sourceConfigEntity,
    });

    if (result.status === "completed") {
      logger.info(
        `Ingestion completed for ${message.source.id} (${result.chunksCount} chunks)`,
      );
    } else {
      logger.error(
        `Ingestion failed for ${message.source.id}: ${result.error}`,
      );
    }
  } catch (error) {
    if (error instanceof QuotaExhaustedError) {
      try {
        await upsertIngestionStatus(
          ingestionLogEntity,
          message.source.id,
          message.source.url,
          "quota_exceeded",
          { errorMessage: error.message },
        );
      } catch {
        // best-effort
      }

      const queue = createQueueService();
      await queue.purge(getResource("IngestionQueue").url);

      logger.error(
        "OpenAI quota exhausted — purged ingestion queue. " +
          "Resolve billing at https://platform.openai.com/account/billing " +
          "and re-run coordinator to resume.",
      );
    }

    throw error;
  }
}
