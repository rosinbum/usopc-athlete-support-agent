import type { IngestionLogEntity } from "./entities/index.js";

/**
 * Retrieve the content hash of the last successful ingestion for a source.
 */
export async function getLastContentHash(
  entity: IngestionLogEntity,
  sourceId: string,
): Promise<string | null> {
  return entity.getLastContentHash(sourceId);
}

/**
 * Insert or update an ingestion status entry in DynamoDB.
 *
 * Supported statuses: "ingesting", "completed", "failed", "quota_exceeded".
 * These are mapped to the IngestionLog entity statuses:
 * - "ingesting" -> create new log with status "in_progress"
 * - "completed" -> update latest log to "completed"
 * - "failed" -> update latest log to "failed"
 * - "quota_exceeded" -> update latest log to "failed" with error message
 */
export async function upsertIngestionStatus(
  entity: IngestionLogEntity,
  sourceId: string,
  sourceUrl: string,
  status: string,
  fields: {
    contentHash?: string;
    chunksCount?: number;
    errorMessage?: string;
  } = {},
): Promise<void> {
  const now = new Date().toISOString();

  if (status === "ingesting") {
    // Create a new ingestion log entry
    await entity.create({
      sourceId,
      sourceUrl,
      status: "in_progress",
    });
  } else {
    // Get the most recent log for this source and update it
    const logs = await entity.getForSource(sourceId, 1);
    if (logs.length > 0) {
      const latest = logs[0];
      const mappedStatus = status === "quota_exceeded" ? "failed" : status;
      await entity.updateStatus(
        sourceId,
        latest.startedAt,
        mappedStatus as "completed" | "failed",
        {
          ...fields,
          completedAt: now,
          errorMessage:
            status === "quota_exceeded"
              ? (fields.errorMessage ?? "Quota exceeded")
              : fields.errorMessage,
        },
      );
    }
  }
}
