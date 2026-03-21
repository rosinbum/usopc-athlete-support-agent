import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { getResource } from "@usopc/shared";
import type { DiscoveryFeedMessage } from "@usopc/core";

const sqs = new SQSClient({});

/**
 * Send one or more discovered sources to the DiscoveryFeedQueue for
 * re-evaluation. Each discovery becomes a single SQS message with
 * discoveryMethod "manual" and discoveredFrom "admin-reprocess".
 */
export async function enqueueForReprocess(
  discoveries: Array<{ url: string; title: string }>,
): Promise<{ queued: number; failed: number }> {
  const queueUrl = getResource("DiscoveryFeedQueue").url;

  const results = await Promise.allSettled(
    discoveries.map((d) => {
      const message: DiscoveryFeedMessage = {
        urls: [
          {
            url: d.url,
            title: d.title,
            discoveryMethod: "manual",
            discoveredFrom: "admin-reprocess",
          },
        ],
        timestamp: new Date().toISOString(),
      };
      return sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
        }),
      );
    }),
  );

  const queued = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  return { queued, failed };
}
