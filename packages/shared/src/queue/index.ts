export type { QueueService } from "./QueueService.js";
export { PubSubQueueService } from "./PubSubQueueService.js";

import { PubSubQueueService } from "./PubSubQueueService.js";
import type { QueueService } from "./QueueService.js";

/**
 * Create a QueueService backed by Google Cloud Pub/Sub.
 */
export function createQueueService(): QueueService {
  return new PubSubQueueService();
}
