import type { Document } from "@langchain/core/documents";
import { createLogger, type AuthorityLevel } from "@usopc/shared";
import {
  MODEL_CONFIG,
  createRawEmbeddings,
  createVectorStore,
} from "@usopc/core";
import { loadPdf } from "./loaders/pdfLoader.js";
import { loadWeb } from "./loaders/webLoader.js";
import { cleanText } from "./transformers/cleaner.js";
import { enrichMetadata } from "./transformers/metadataEnricher.js";
import { sectionAwareSplit } from "./transformers/sectionSplitter.js";

const logger = createLogger({ service: "ingestion-pipeline" });

// ---------------------------------------------------------------------------
// Quota exhaustion detection
// ---------------------------------------------------------------------------

export class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("insufficient_quota") ||
    msg.includes("exceeded your current quota") ||
    msg.includes("billing hard limit has been reached")
  );
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IngestionSource {
  id: string;
  title: string;
  documentType: string;
  topicDomains: string[];
  url: string;
  format: "pdf" | "html" | "text";
  ngbId: string | null;
  priority: "high" | "medium" | "low";
  description: string;
  authorityLevel?: AuthorityLevel | undefined;
}

export interface IngestionResult {
  sourceId: string;
  status: "completed" | "failed";
  chunksCount: number;
  error?: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load raw documents from the source based on its declared format.
 * When `content` is provided the loaders skip the HTTP fetch and use the
 * pre-fetched data directly, eliminating the double-fetch problem.
 */
async function loadDocuments(
  source: IngestionSource,
  content?: Buffer,
): Promise<Document[]> {
  switch (source.format) {
    case "pdf":
      return await loadPdf(source.url, content);
    case "html":
      return await loadWeb(
        source.url,
        content !== undefined ? content.toString("utf-8") : undefined,
      );
    case "text":
      // Plain text URLs are loaded via the web loader which will extract
      // the text content from the response body.
      return await loadWeb(
        source.url,
        content !== undefined ? content.toString("utf-8") : undefined,
      );
    default:
      throw new Error(`Unsupported format: ${source.format as string}`);
  }
}

/**
 * Apply the text cleaner to every document in the array, mutating the
 * `pageContent` in place.
 */
function cleanDocuments(documents: Document[]): Document[] {
  return documents.map((doc) => ({
    ...doc,
    pageContent: cleanText(doc.pageContent),
  }));
}

/**
 * Rough token count estimate (1 token ≈ 4 chars for English text).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split documents into batches that stay under the given token budget.
 * Each batch will be embedded in a single API call.
 */
function batchByTokenBudget(docs: Document[], maxTokens: number): Document[][] {
  const batches: Document[][] = [];
  let current: Document[] = [];
  let currentTokens = 0;

  for (const doc of docs) {
    const tokens = estimateTokens(doc.pageContent);
    if (current.length > 0 && currentTokens + tokens > maxTokens) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(doc);
    currentTokens += tokens;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Adaptive rate limiting
// ---------------------------------------------------------------------------

export const TPM_LIMIT = 40_000;
export const TPM_HEADROOM = 0.8; // use 80% of limit = 32K effective
export const RATE_WINDOW_MS = 60_000;

export class TokenRateLimiter {
  private log: { time: number; tokens: number }[] = [];

  record(tokens: number): void {
    this.log.push({ time: Date.now(), tokens });
  }

  async waitIfNeeded(nextTokens: number): Promise<void> {
    const now = Date.now();
    this.log = this.log.filter((e) => now - e.time < RATE_WINDOW_MS);
    const consumed = this.log.reduce((sum, e) => sum + e.tokens, 0);
    const budget = TPM_LIMIT * TPM_HEADROOM;

    if (consumed + nextTokens > budget) {
      const oldest = this.log[0]!.time;
      const waitMs = RATE_WINDOW_MS - (now - oldest) + 500;
      if (waitMs > 0) {
        logger.info(`Rate limiter: waiting ${(waitMs / 1000).toFixed(1)}s ...`);
        await sleep(waitMs);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Embedding helpers
// ---------------------------------------------------------------------------

const EMBED_BATCH_MAX_RETRIES = 2;
const EMBED_BATCH_RETRY_DELAY_MS = 30_000;

class EmbeddingDimensionError extends Error {
  constructor(expected: number, actual: number) {
    super(
      `OpenAI returned ${actual}-dim embeddings (expected ${expected}). ` +
        "This indicates a configuration or API version mismatch.",
    );
    this.name = "EmbeddingDimensionError";
  }
}

/**
 * Attempt to embed a batch of documents, retrying on transient errors.
 * Validates embedding dimensions before inserting to catch OpenAI API
 * inconsistencies early. Quota errors are never retried.
 */
async function embedBatchWithRetry(
  vectorStore: {
    addVectors: (
      vectors: number[][],
      documents: Document[],
    ) => Promise<unknown>;
  },
  embeddings: { embedDocuments: (texts: string[]) => Promise<number[][]> },
  batch: Document[],
  expectedDimensions: number,
  sourceId: string,
  batchIndex: number,
  totalBatches: number,
): Promise<void> {
  for (let attempt = 0; attempt <= EMBED_BATCH_MAX_RETRIES; attempt++) {
    try {
      const texts = batch.map((d) => d.pageContent);
      const vectors = await embeddings.embedDocuments(texts);

      // Validate dimensions before inserting — OpenAI occasionally returns
      // wrong dimensions during server instability.
      if (vectors.length > 0 && vectors[0]!.length !== expectedDimensions) {
        throw new EmbeddingDimensionError(
          expectedDimensions,
          vectors[0]!.length,
        );
      }

      await vectorStore.addVectors(vectors, batch);
      return;
    } catch (error) {
      // Dimension errors are not transient - throw immediately without retry
      if (error instanceof EmbeddingDimensionError) {
        throw error;
      }
      if (isQuotaError(error)) {
        throw new QuotaExhaustedError(
          error instanceof Error ? error.message : "OpenAI quota exhausted",
        );
      }
      if (attempt >= EMBED_BATCH_MAX_RETRIES) {
        throw error;
      }
      logger.warn(
        `Batch ${batchIndex + 1}/${totalBatches} failed (attempt ${attempt + 1}/${EMBED_BATCH_MAX_RETRIES + 1}), retrying in ${EMBED_BATCH_RETRY_DELAY_MS / 1000}s...`,
        {
          sourceId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      await sleep(EMBED_BATCH_RETRY_DELAY_MS);
    }
  }
}

// ---------------------------------------------------------------------------
// Pipeline entry points
// ---------------------------------------------------------------------------

/**
 * Ingest a single source: load -> clean -> section-split -> enrich -> embed -> store.
 */
export async function ingestSource(
  source: IngestionSource,
  options: {
    openaiApiKey: string;
    storageKey?: string | undefined;
    content?: Buffer | undefined;
    vectorStore?: Awaited<ReturnType<typeof createVectorStore>> | undefined;
    rateLimiter?: TokenRateLimiter | undefined;
  },
): Promise<IngestionResult> {
  logger.info(`Starting ingestion for source: ${source.id}`, {
    sourceId: source.id,
    format: source.format,
    url: source.url,
  });

  try {
    // 1. Load raw document(s) — use pre-fetched content when available
    const rawDocs = await loadDocuments(source, options.content);
    if (rawDocs.length === 0) {
      throw new Error(`Loader returned 0 documents for ${source.url}`);
    }
    logger.info(`Loaded ${rawDocs.length} document(s) from ${source.url}`, {
      sourceId: source.id,
    });

    // 2. Clean content
    const allCleaned = cleanDocuments(rawDocs);
    const cleanedDocs = allCleaned.filter(
      (doc) => doc.pageContent.trim().length > 0,
    );
    if (cleanedDocs.length === 0) {
      throw new Error(
        `All ${rawDocs.length} document(s) were empty after cleaning for ${source.url}`,
      );
    }

    // 3. Section-aware split — detects section headings first, then splits
    //    within sections so every chunk inherits its section_title.
    const chunks = await sectionAwareSplit(cleanedDocs);
    logger.info(`Split into ${chunks.length} chunks`, {
      sourceId: source.id,
    });

    // 4. Enrich metadata
    const enriched = enrichMetadata(
      chunks,
      source,
      options.storageKey !== undefined
        ? { storageKey: options.storageKey }
        : undefined,
    );

    // 5. Generate embeddings & store in pgvector (batched to respect TPM limits)
    const embeddings = createRawEmbeddings(options.openaiApiKey);
    const vectorStore =
      options.vectorStore ?? (await createVectorStore(embeddings));

    // Use small batches (~8K tokens) to avoid OpenAI 500 errors on large
    // payloads. Adaptive rate limiting sleeps only when approaching the TPM cap.
    const batches = batchByTokenBudget(enriched, 8_000);
    const limiter = options.rateLimiter ?? new TokenRateLimiter();
    logger.info(
      `Embedding ${enriched.length} chunks in ${batches.length} batch(es)`,
      { sourceId: source.id },
    );

    for (let i = 0; i < batches.length; i++) {
      const batchTokens = batches[i]!.reduce(
        (sum, doc) => sum + estimateTokens(doc.pageContent),
        0,
      );
      await limiter.waitIfNeeded(batchTokens);
      await embedBatchWithRetry(
        vectorStore,
        embeddings,
        batches[i]!,
        MODEL_CONFIG.embeddings.dimensions,
        source.id,
        i,
        batches.length,
      );
      limiter.record(batchTokens);
      logger.info(
        `Batch ${i + 1}/${batches.length} complete (${batches[i]!.length} chunks)`,
        { sourceId: source.id },
      );
    }

    logger.info(
      `Successfully ingested ${enriched.length} chunks for ${source.id}`,
      { sourceId: source.id },
    );

    return {
      sourceId: source.id,
      status: "completed",
      chunksCount: enriched.length,
    };
  } catch (error) {
    if (error instanceof QuotaExhaustedError) throw error;

    const message =
      error instanceof Error ? error.message : "Unknown ingestion error";

    logger.error(`Ingestion failed for source: ${source.id} — ${message}`, {
      sourceId: source.id,
      error: message,
    });

    return {
      sourceId: source.id,
      status: "failed",
      chunksCount: 0,
      error: message,
    };
  }
}

/**
 * Ingest all provided sources sequentially and return results for each.
 */
export async function ingestAll(
  sources: IngestionSource[],
  options: {
    openaiApiKey: string;
  },
): Promise<IngestionResult[]> {
  logger.info(`Starting batch ingestion for ${sources.length} source(s)`);

  // Create a single vectorStore + embeddings up front so all sources share
  // the same pool instead of each creating its own.
  const embeddings = createRawEmbeddings(options.openaiApiKey);
  const vectorStore = await createVectorStore(embeddings);

  // Shared rate limiter tracks token consumption across all sources so
  // inter-source gaps are only as long as actually needed.
  const rateLimiter = new TokenRateLimiter();

  const results: IngestionResult[] = [];
  for (let i = 0; i < sources.length; i++) {
    const result = await ingestSource(sources[i]!, {
      openaiApiKey: options.openaiApiKey,
      vectorStore,
      rateLimiter,
    });
    results.push(result);
  }

  const succeeded = results.filter((r) => r.status === "completed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const totalChunks = results.reduce((sum, r) => sum + r.chunksCount, 0);

  logger.info(
    `Batch ingestion complete: ${succeeded} succeeded, ${failed} failed, ${totalChunks} total chunks`,
  );

  return results;
}
