export interface QueueService {
  /**
   * Send a single message to a queue/topic.
   */
  sendMessage(
    queueUrl: string,
    body: string,
    options?: { groupId?: string },
  ): Promise<void>;

  /**
   * Send a batch of messages to a queue/topic.
   * Returns the count of failed messages.
   */
  sendMessageBatch(
    queueUrl: string,
    messages: Array<{ id: string; body: string }>,
  ): Promise<number>;

  /**
   * Purge all messages from a queue/topic (best-effort).
   */
  purge(queueUrl: string): Promise<void>;

  /**
   * Get approximate queue depth stats (for monitoring).
   * Returns null if the provider doesn't support this.
   */
  getStats(
    queueUrl: string,
  ): Promise<{ visible: number; inFlight: number } | null>;
}
