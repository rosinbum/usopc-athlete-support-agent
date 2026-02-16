import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { logger } from "@usopc/shared";
import { getModelConfig } from "../config/index.js";
import {
  invokeAnthropic,
  extractTextFromResponse,
} from "./anthropicService.js";
import { buildSummaryPrompt } from "../prompts/conversationMemory.js";

const log = logger.child({ service: "conversation-memory" });

/** Default TTL for cached summaries (1 hour in ms). */
const DEFAULT_SUMMARY_TTL_MS = 3_600_000;

/**
 * Returns the summary TTL in ms.
 * Configurable via SUMMARY_TTL_MS env var (set in sst.config.ts).
 */
export function getSummaryTtlMs(): number {
  const value = process.env.SUMMARY_TTL_MS;
  if (!value) return DEFAULT_SUMMARY_TTL_MS;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? DEFAULT_SUMMARY_TTL_MS : parsed;
}

/**
 * Abstraction for swapping summary storage backends (in-memory, Redis, etc.).
 */
export interface SummaryStore {
  get(conversationId: string): Promise<string | undefined>;
  set(conversationId: string, summary: string): Promise<void>;
}

interface CacheEntry {
  summary: string;
  expiresAt: number;
}

/**
 * In-memory summary store with TTL-based expiration.
 * Summaries are lost on Lambda cold start — intentional for privacy.
 */
export class InMemorySummaryStore implements SummaryStore {
  private cache = new Map<string, CacheEntry>();

  async get(conversationId: string): Promise<string | undefined> {
    const entry = this.cache.get(conversationId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(conversationId);
      return undefined;
    }
    return entry.summary;
  }

  async set(conversationId: string, summary: string): Promise<void> {
    this.cache.set(conversationId, {
      summary,
      expiresAt: Date.now() + getSummaryTtlMs(),
    });
  }
}

let store: SummaryStore = new InMemorySummaryStore();

/**
 * Returns the current summary store singleton.
 */
export function getSummaryStore(): SummaryStore {
  return store;
}

/**
 * Replaces the summary store (for testing or swapping to Redis).
 */
export function setSummaryStore(newStore: SummaryStore): void {
  store = newStore;
}

/**
 * Loads a conversation summary from the store.
 */
export async function loadSummary(
  conversationId: string,
): Promise<string | undefined> {
  return store.get(conversationId);
}

/**
 * Saves a conversation summary to the store.
 */
export async function saveSummary(
  conversationId: string,
  summary: string,
): Promise<void> {
  return store.set(conversationId, summary);
}

/**
 * Generates a rolling summary of conversation messages using Haiku.
 * If an existing summary is provided, it's incorporated into the new one.
 */
export async function generateSummary(
  messages: BaseMessage[],
  existingSummary?: string,
): Promise<string> {
  const config = await getModelConfig();
  const model = new ChatAnthropic({
    model: config.classifier.model, // Haiku
    temperature: 0,
    maxTokens: 1024,
  });

  const prompt = buildSummaryPrompt(messages, existingSummary);

  try {
    const response = await invokeAnthropic(model, [new HumanMessage(prompt)]);
    return extractTextFromResponse(response);
  } catch (error) {
    log.error("Failed to generate conversation summary", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Return existing summary on failure rather than losing context
    return existingSummary ?? "";
  }
}
