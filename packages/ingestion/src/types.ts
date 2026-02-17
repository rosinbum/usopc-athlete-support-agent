/**
 * Configuration for the discovery pipeline.
 */
export interface DiscoveryConfig {
  tavilyApiKey: string;
  /** @deprecated Evaluation moved to DiscoveryFeedWorker. Only used by legacy discoveryCoordinator. */
  anthropicApiKey?: string;
  autoApprovalThreshold: number;
}
