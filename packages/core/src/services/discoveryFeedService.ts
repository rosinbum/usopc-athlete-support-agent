import { createHash } from "node:crypto";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { logger } from "@usopc/shared";
import type { WebSearchResult, DiscoveryFeedMessage } from "../types/index.js";

const log = logger.child({ service: "discovery-feed" });
const sqs = new SQSClient({});

/**
 * Normalizes a URL for deduplication:
 * - Strips fragment (#...)
 * - Strips trailing slash
 * - Strips www. prefix from host
 */
export function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    // Strip www. prefix
    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    let normalized = parsed.toString();
    // Strip trailing slash (but not for root "/")
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    // If URL parsing fails, return as-is
    return raw;
  }
}

/**
 * Generates a deterministic SHA-256 ID from a normalized URL.
 */
export function urlToId(normalizedUrl: string): string {
  return createHash("sha256").update(normalizedUrl).digest("hex");
}

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
