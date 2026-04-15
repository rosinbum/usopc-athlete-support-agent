import { PubSub } from "@google-cloud/pubsub";
import type { QueueService } from "./QueueService.js";

/**
 * Google Cloud Pub/Sub implementation of QueueService.
 *
 * The queueUrl parameter is treated as a topic name (e.g., "ingestion").
 * Pub/Sub push subscriptions deliver messages to Cloud Run HTTP endpoints.
 */
export class PubSubQueueService implements QueueService {
  private pubsub: PubSub;

  constructor(pubsub?: PubSub) {
    this.pubsub = pubsub ?? new PubSub();
  }

  async sendMessage(
    topicName: string,
    body: string,
    options?: { groupId?: string },
  ): Promise<void> {
    const topic = this.pubsub.topic(topicName);
    const attributes: Record<string, string> = {};
    if (options?.groupId) {
      // Pub/Sub ordering key provides FIFO-like behavior per key
      attributes.orderingKey = options.groupId;
    }
    await topic.publishMessage({
      data: Buffer.from(body),
      ...(options?.groupId && { orderingKey: options.groupId }),
      attributes,
    });
  }

  async sendMessageBatch(
    topicName: string,
    messages: Array<{ id: string; body: string }>,
  ): Promise<number> {
    const topic = this.pubsub.topic(topicName);
    let failed = 0;

    // Pub/Sub doesn't have a native batch API like SQS.
    // Publish concurrently and count failures.
    const results = await Promise.allSettled(
      messages.map((m) =>
        topic.publishMessage({ data: Buffer.from(m.body) }),
      ),
    );

    for (const r of results) {
      if (r.status === "rejected") failed++;
    }

    return failed;
  }

  async purge(topicName: string): Promise<void> {
    // Pub/Sub doesn't support purging topics.
    // The equivalent is to seek the subscription to the current time,
    // which acknowledges all undelivered messages.
    // This is a no-op here; implement via subscription seek if needed.
  }

  async getStats(
    _topicName: string,
  ): Promise<{ visible: number; inFlight: number } | null> {
    // Pub/Sub monitoring is done via Cloud Monitoring API, not inline.
    // Return null to indicate stats are unavailable via this interface.
    return null;
  }
}
