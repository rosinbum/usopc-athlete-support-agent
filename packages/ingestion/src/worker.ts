import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { SQSClient, PurgeQueueCommand } from "@aws-sdk/client-sqs";
import { Pool } from "pg";
import { Resource } from "sst";
import { createLogger, getDatabaseUrl, getSecretValue } from "@usopc/shared";
import { ingestSource, QuotaExhaustedError } from "./pipeline.js";
import { upsertIngestionStatus } from "./db.js";
import type { IngestionMessage } from "./cron.js";

const logger = createLogger({ service: "ingestion-worker" });

/**
 * SQS-triggered Lambda handler that processes a single ingestion source.
 *
 * The FIFO queue with a single MessageGroupId ensures only one worker runs
 * at a time, serializing OpenAI embedding calls to stay within TPM limits.
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const record = event.Records[0];
  const message: IngestionMessage = JSON.parse(record.body);

  const databaseUrl = getDatabaseUrl();
  const openaiApiKey = getSecretValue("OPENAI_API_KEY", "OpenaiApiKey");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    logger.info(`Processing source: ${message.source.id}`, {
      sourceId: message.source.id,
      url: message.source.url,
      triggeredAt: message.triggeredAt,
    });

    const result = await ingestSource(message.source, {
      databaseUrl,
      openaiApiKey,
    });

    if (result.status === "completed") {
      await upsertIngestionStatus(
        pool,
        message.source.id,
        message.source.url,
        "completed",
        {
          contentHash: message.contentHash,
          chunksCount: result.chunksCount,
        },
      );
      logger.info(
        `Ingestion completed for ${message.source.id} (${result.chunksCount} chunks)`,
      );
    } else {
      await upsertIngestionStatus(
        pool,
        message.source.id,
        message.source.url,
        "failed",
        { errorMessage: result.error },
      );
      logger.error(
        `Ingestion failed for ${message.source.id}: ${result.error}`,
      );
    }

    return { batchItemFailures: [] };
  } catch (error) {
    if (error instanceof QuotaExhaustedError) {
      await upsertIngestionStatus(
        pool,
        message.source.id,
        message.source.url,
        "quota_exceeded",
        { errorMessage: error.message },
      );

      // Stop all further ingestion — remaining messages would fail the same way
      const sqs = new SQSClient({});
      await sqs.send(
        new PurgeQueueCommand({
          QueueUrl: Resource.IngestionQueue.url,
        }),
      );

      logger.error(
        "OpenAI quota exhausted — purged ingestion queue. " +
          "Resolve billing at https://platform.openai.com/account/billing " +
          "and re-run coordinator to resume.",
      );

      return { batchItemFailures: [] };
    }

    // Unexpected error — report as batch failure so SQS retries
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Unexpected worker error for ${message.source.id}: ${msg}`);

    return {
      batchItemFailures: [{ itemIdentifier: record.messageId }],
    };
  } finally {
    await pool.end();
  }
}
