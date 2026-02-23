import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { logger, parseEnvInt } from "@usopc/shared";
import { getModelConfig, createChatModel } from "../config/index.js";
import { invokeLlm, extractTextFromResponse } from "./llmService.js";
import { buildSummaryPrompt } from "../prompts/conversationMemory.js";

const log = logger.child({ service: "conversation-memory" });

/** Default TTL for cached summaries (1 hour in ms). */
const DEFAULT_SUMMARY_TTL_MS = 3_600_000;

/**
 * Returns the summary TTL in ms.
 * Configurable via SUMMARY_TTL_MS env var (set in sst.config.ts).
 */
export function getSummaryTtlMs(): number {
  return parseEnvInt("SUMMARY_TTL_MS", DEFAULT_SUMMARY_TTL_MS);
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

/** Maximum number of cached summaries before LRU eviction kicks in. */
const DEFAULT_MAX_ENTRIES = 1000;

/**
 * In-memory summary store with TTL-based expiration and LRU eviction.
 * Summaries are lost on Lambda cold start — intentional for privacy.
 * Capped at {@link DEFAULT_MAX_ENTRIES} entries to prevent unbounded memory
 * growth in long-lived Lambda warm containers.
 */
export class InMemorySummaryStore implements SummaryStore {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  async get(conversationId: string): Promise<string | undefined> {
    const entry = this.cache.get(conversationId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(conversationId);
      return undefined;
    }
    // Move to end for LRU ordering (Map preserves insertion order)
    this.cache.delete(conversationId);
    this.cache.set(conversationId, entry);
    return entry.summary;
  }

  async set(conversationId: string, summary: string): Promise<void> {
    // Delete first so re-insertion moves to end (most recently used)
    this.cache.delete(conversationId);
    this.cache.set(conversationId, {
      summary,
      expiresAt: Date.now() + getSummaryTtlMs(),
    });
    // Evict oldest entries if over capacity
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value!;
      this.cache.delete(oldest);
    }
  }

  /** Returns the current number of cached entries (for testing/observability). */
  get size(): number {
    return this.cache.size;
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
 * Generates a rolling summary of conversation messages using the classifier model.
 * If an existing summary is provided, it's incorporated into the new one.
 *
 * @param messages - The conversation messages to summarize.
 * @param existingSummary - An existing summary to incorporate (rolling summary).
 * @param model - A shared BaseChatModel instance. When omitted, a transient
 *   instance is created from config (backward compat for tests/dev tools).
 *   Callers with a long-lived model (e.g., AgentRunner) should pass it
 *   explicitly to avoid redundant allocations.
 */
export async function generateSummary(
  messages: BaseMessage[],
  existingSummary?: string,
  model?: BaseChatModel,
): Promise<string> {
  let resolvedModel: BaseChatModel;
  if (model) {
    resolvedModel = model;
  } else {
    log.warn(
      "No model passed to generateSummary — creating transient instance. " +
        "Pass the classifierModel explicitly to eliminate this allocation.",
    );
    const config = await getModelConfig();
    resolvedModel = createChatModel(config.classifier);
  }

  const prompt = buildSummaryPrompt(messages, existingSummary);

  try {
    const response = await invokeLlm(resolvedModel, [new HumanMessage(prompt)]);
    return extractTextFromResponse(response);
  } catch (error) {
    log.error("Failed to generate conversation summary", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Return existing summary on failure rather than losing context
    return existingSummary ?? "";
  }
}
