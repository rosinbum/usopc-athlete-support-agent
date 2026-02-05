import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { SQSClient, PurgeQueueCommand } from "@aws-sdk/client-sqs";
import { Pool } from "pg";
import { Resource } from "sst";
import { createLogger, getDatabaseUrl, getSecretValue } from "@usopc/shared";
import { ingestSource, QuotaExhaustedError } from "./pipeline.js";
import { upsertIngestionStatus } from "./db.js";
import type { IngestionMessage } from "./cron.js";

const logger = createLogger({ service: "ingestion-worker" });

/**
 * SQS-triggered Lambda handler that processes ingestion source messages.
 *
 * The FIFO queue with a single MessageGroupId ensures only one worker runs
 * at a time, serializing OpenAI embedding calls to stay within TPM limits.
 *
 * Processes all records in the event batch. Malformed messages are dropped.
 * On QuotaExhaustedError the loop breaks and remaining records are reported
 * as batch item failures so SQS can redeliver them later.
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const databaseUrl = getDatabaseUrl();
  const openaiApiKey = getSecretValue("OPENAI_API_KEY", "OpenaiApiKey");
  const pool = new Pool({ connectionString: databaseUrl });

  const batchItemFailures: { itemIdentifier: string }[] = [];

  try {
    for (let idx = 0; idx < event.Records.length; idx++) {
      const record: SQSRecord = event.Records[idx];

      let message: IngestionMessage;
      try {
        message = JSON.parse(record.body);
      } catch {
        logger.warn(
          `Skipping malformed message ${record.messageId}: invalid JSON`,
        );
        continue;
      }

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
      } catch (error) {
        if (error instanceof QuotaExhaustedError) {
          // Mark this source as quota-exceeded
          try {
            await upsertIngestionStatus(
              pool,
              message.source.id,
              message.source.url,
              "quota_exceeded",
              { errorMessage: error.message },
            );
          } catch {
            // best-effort
          }

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

          // Mark remaining records as batch failures
          for (let r = idx + 1; r < event.Records.length; r++) {
            batchItemFailures.push({
              itemIdentifier: event.Records[r].messageId,
            });
          }
          break;
        }

        // Unexpected error — report as batch failure so SQS retries
        const msg = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          `Unexpected worker error for ${message.source.id}: ${msg}`,
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  } finally {
    await pool.end();
  }
}
