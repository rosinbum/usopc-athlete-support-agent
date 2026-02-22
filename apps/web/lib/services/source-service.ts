import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  deleteChunksBySourceId,
  updateChunkMetadataBySourceId,
  getResource,
  getPool,
  type SourceConfig,
  type SourceConfigEntity,
} from "@usopc/shared";

type Pool = ReturnType<typeof getPool>;

// Fields that require re-ingestion (content changes)
export const CONTENT_AFFECTING_FIELDS = new Set(["url", "format"]);

// Fields that require chunk metadata updates (no re-ingestion)
export const METADATA_FIELDS = new Set([
  "title",
  "documentType",
  "topicDomains",
  "ngbId",
  "authorityLevel",
]);

/**
 * Build the SQS message body for triggering document ingestion.
 */
export function buildIngestionMessage(source: SourceConfig) {
  return {
    source: {
      id: source.id,
      title: source.title,
      documentType: source.documentType,
      topicDomains: source.topicDomains,
      url: source.url,
      format: source.format,
      ngbId: source.ngbId,
      priority: source.priority,
      description: source.description,
      authorityLevel: source.authorityLevel,
    },
    contentHash: "manual",
    triggeredAt: new Date().toISOString(),
  };
}

/**
 * Send an ingestion message to SQS for a source.
 * Returns `{ triggered: true }` on success.
 * Throws if the queue is unavailable or send fails.
 */
export async function triggerIngestion(
  source: SourceConfig,
): Promise<{ triggered: boolean }> {
  const queueUrl = getResource("IngestionQueue").url;
  const message = buildIngestionMessage(source);

  const sqs = new SQSClient({});
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      MessageGroupId: source.id,
    }),
  );
  return { triggered: true };
}

/**
 * Delete a source — removes PG chunks first, then DynamoDB config.
 */
export async function deleteSource(
  id: string,
  entity: SourceConfigEntity,
  pool: Pool,
): Promise<{ chunksDeleted: number }> {
  const chunksDeleted = await deleteChunksBySourceId(pool, id);
  await entity.delete(id);
  return { chunksDeleted };
}

/**
 * Update a source — detects content vs metadata changes, orchestrates
 * chunk deletion/update, DynamoDB update, and optional re-ingestion.
 */
export async function updateSource(
  id: string,
  data: Partial<Omit<SourceConfig, "id" | "createdAt">>,
  entity: SourceConfigEntity,
  pool: Pool,
): Promise<{ source: SourceConfig; actions: Record<string, unknown> }> {
  const changedKeys = Object.keys(data);
  const hasContentChange = changedKeys.some((k) =>
    CONTENT_AFFECTING_FIELDS.has(k),
  );
  const hasMetadataChange = changedKeys.some((k) => METADATA_FIELDS.has(k));
  const actions: Record<string, unknown> = {};

  if (hasContentChange) {
    const chunksDeleted = await deleteChunksBySourceId(pool, id);
    actions.chunksDeleted = chunksDeleted;

    const source = await entity.update(id, data);

    try {
      await triggerIngestion(source);
      actions.reIngestionTriggered = true;
    } catch {
      // SQS not available in dev — still proceed with the update
      actions.reIngestionTriggered = false;
    }

    return { source, actions };
  }

  if (hasMetadataChange) {
    const metadataUpdates: Record<string, unknown> = {};
    if (data.title !== undefined) metadataUpdates.title = data.title;
    if (data.documentType !== undefined)
      metadataUpdates.documentType = data.documentType;
    if (data.topicDomains !== undefined)
      metadataUpdates.topicDomains = data.topicDomains;
    if (data.ngbId !== undefined) metadataUpdates.ngbId = data.ngbId;
    if (data.authorityLevel !== undefined)
      metadataUpdates.authorityLevel = data.authorityLevel;

    const chunksUpdated = await updateChunkMetadataBySourceId(
      pool,
      id,
      metadataUpdates,
    );
    actions.chunksUpdated = chunksUpdated;
  }

  const source = await entity.update(id, data);
  return { source, actions };
}
