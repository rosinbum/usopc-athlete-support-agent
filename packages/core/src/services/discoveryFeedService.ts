import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { logger, normalizeUrl, urlToId } from "@usopc/shared";
import type { WebSearchResult, DiscoveryFeedMessage } from "../types/index.js";

export { normalizeUrl, urlToId };

const log = logger.child({ service: "discovery-feed" });
const sqs = new SQSClient({});

/**
 * Publishes discovered URLs from the researcher's web search results
 * to the DiscoveryFeedQueue for async evaluation by the worker Lambda.
 *
 * - Never throws — logs all operations
 * - Returns immediately for empty input
 */
export async function publishDiscoveredUrls(
  results: WebSearchResult[],
  queueUrl: string,
): Promise<void> {
  if (results.length === 0) return;

  const message: DiscoveryFeedMessage = {
    urls: results.map((r) => ({
      url: r.url,
      title: r.title,
      discoveryMethod: "agent" as const,
      discoveredFrom: "agent-web-search",
    })),
    timestamp: new Date().toISOString(),
  };

  try {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      }),
    );

    log.info("Published discovered URLs to queue", {
      count: results.length,
      queueUrl,
    });
  } catch (error) {
    log.error("Failed to publish discovered URLs", {
      error: error instanceof Error ? error.message : String(error),
      count: results.length,
    });
  }
}
