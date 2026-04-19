import { getResource, createQueueService } from "@usopc/shared";
import type { DiscoveryFeedMessage } from "@usopc/core";

const queue = createQueueService();

// Mirrors DISCOVERY_FEED_CHUNK_SIZE in packages/ingestion/src/discoveryOrchestrator.ts
// (#692). Keeping the batch small prevents the feed worker from running out of
// memory / exceeding the ack deadline when processing a republish.
export const REPROCESS_CHUNK_SIZE = 15;

/**
 * Send one or more discovered sources to the DiscoveryFeedQueue for
 * re-evaluation. URLs are batched into messages of at most
 * REPROCESS_CHUNK_SIZE with discoveryMethod "manual" and
 * discoveredFrom "admin-reprocess".
 */
export async function enqueueForReprocess(
  discoveries: Array<{ url: string; title: string }>,
): Promise<{ queued: number; failed: number }> {
  if (discoveries.length === 0) return { queued: 0, failed: 0 };

  const queueUrl = getResource("DiscoveryFeedQueue").url;
  const timestamp = new Date().toISOString();

  const chunks: Array<typeof discoveries> = [];
  for (let i = 0; i < discoveries.length; i += REPROCESS_CHUNK_SIZE) {
    chunks.push(discoveries.slice(i, i + REPROCESS_CHUNK_SIZE));
  }

  const results = await Promise.allSettled(
    chunks.map((chunk) => {
      const message: DiscoveryFeedMessage = {
        urls: chunk.map((d) => ({
          url: d.url,
          title: d.title,
          discoveryMethod: "manual",
          discoveredFrom: "admin-reprocess",
        })),
        timestamp,
      };
      return queue
        .sendMessage(queueUrl, JSON.stringify(message))
        .then(() => chunk.length);
    }),
  );

  let queued = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const size = chunks[i]!.length;
    if (r.status === "fulfilled") queued += size;
    else failed += size;
  }
  return { queued, failed };
}
