import type { Document } from "@langchain/core/documents";
import { Client } from "pg";
import { createLogger, type AuthorityLevel } from "@usopc/shared";
import { MODEL_CONFIG } from "@usopc/core/src/config/index";
import {
  createRawEmbeddings,
  createVectorStore,
} from "@usopc/core/src/rag/index";
import { loadPdf } from "./loaders/pdfLoader.js";
import { loadWeb } from "./loaders/webLoader.js";
import { loadHtml } from "./loaders/htmlLoader.js";
import { cleanText } from "./transformers/cleaner.js";
import { splitDocuments, createSplitter } from "./transformers/splitter.js";
import { enrichMetadata } from "./transformers/metadataEnricher.js";
import { extractSections } from "./transformers/sectionExtractor.js";

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
  authorityLevel?: AuthorityLevel;
}

export interface IngestionResult {
  sourceId: string;
  status: "completed" | "failed";
  chunksCount: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load raw documents from the source based on its declared format.
 */
async function loadDocuments(source: IngestionSource): Promise<Document[]> {
  switch (source.format) {
    case "pdf":
      return await loadPdf(source.url);
    case "html":
      return await loadWeb(source.url);
    case "text":
      // Plain text URLs are loaded via the web loader which will extract
      // the text content from the response body.
      return await loadWeb(source.url);
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
      if (vectors.length > 0 && vectors[0].length !== expectedDimensions) {
        throw new EmbeddingDimensionError(
          expectedDimensions,
          vectors[0].length,
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

/**
 * Backfill denormalized text columns from the JSONB metadata column.
 * LangChain's PGVectorStore only writes id, content, embedding, and metadata —
 * the dedicated columns (source_url, document_title, etc.) are left NULL.
 */
export async function backfillDenormalizedColumns(
  databaseUrl: string,
): Promise<number> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query(`
      UPDATE document_chunks
      SET
        source_url      = metadata->>'sourceUrl',
        document_title  = metadata->>'documentTitle',
        document_type   = metadata->>'documentType',
        ngb_id          = metadata->>'ngbId',
        topic_domain    = metadata->>'topicDomain',
        authority_level  = metadata->>'authorityLevel',
        section_title   = metadata->>'sectionTitle'
      WHERE source_url IS NULL
        AND metadata->>'sourceUrl' IS NOT NULL
    `);
    return result.rowCount ?? 0;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Pipeline entry points
// ---------------------------------------------------------------------------

/**
 * Ingest a single source: load -> clean -> split -> enrich -> embed -> store.
 */
export async function ingestSource(
  source: IngestionSource,
  options: {
    databaseUrl: string;
    openaiApiKey: string;
  },
): Promise<IngestionResult> {
  logger.info(`Starting ingestion for source: ${source.id}`, {
    sourceId: source.id,
    format: source.format,
    url: source.url,
  });

  try {
    // 1. Load raw document(s)
    const rawDocs = await loadDocuments(source);
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

    // 3. Split into chunks
    const splitter = createSplitter();
    const chunks = await splitDocuments(cleanedDocs, splitter);
    logger.info(`Split into ${chunks.length} chunks`, {
      sourceId: source.id,
    });

    // 4. Enrich metadata
    const enriched = enrichMetadata(chunks, source);

    // 5. Extract section titles
    const withSections = extractSections(enriched);

    // 6. Generate embeddings & store in pgvector (batched to respect TPM limits)
    const embeddings = createRawEmbeddings(options.openaiApiKey);
    const vectorStore = await createVectorStore(embeddings, {
      connectionString: options.databaseUrl,
    });

    // Use small batches (~8K tokens) to avoid OpenAI 500 errors on large
    // payloads, with a 15s inter-batch delay to stay under the 40K TPM limit
    // (8K per 15s ≈ 32K/min, leaving headroom).
    const batches = batchByTokenBudget(withSections, 8_000);
    logger.info(
      `Embedding ${withSections.length} chunks in ${batches.length} batch(es)`,
      { sourceId: source.id },
    );

    for (let i = 0; i < batches.length; i++) {
      if (i > 0) {
        logger.info(`Waiting 15s before batch ${i + 1}/${batches.length}...`, {
          sourceId: source.id,
        });
        await sleep(15_000);
      }
      await embedBatchWithRetry(
        vectorStore,
        embeddings,
        batches[i],
        MODEL_CONFIG.embeddings.dimensions,
        source.id,
        i,
        batches.length,
      );
      logger.info(
        `Batch ${i + 1}/${batches.length} complete (${batches[i].length} chunks)`,
        { sourceId: source.id },
      );
    }

    // 7. Backfill denormalized columns from JSONB metadata
    const backfilled = await backfillDenormalizedColumns(options.databaseUrl);
    logger.info(
      `Backfilled ${backfilled} row(s) with denormalized column values`,
      { sourceId: source.id },
    );

    logger.info(
      `Successfully ingested ${withSections.length} chunks for ${source.id}`,
      { sourceId: source.id },
    );

    return {
      sourceId: source.id,
      status: "completed",
      chunksCount: withSections.length,
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
    databaseUrl: string;
    openaiApiKey: string;
  },
): Promise<IngestionResult[]> {
  logger.info(`Starting batch ingestion for ${sources.length} source(s)`);

  const results: IngestionResult[] = [];
  for (let i = 0; i < sources.length; i++) {
    // Wait between sources to avoid TPM overlap from the previous source's
    // last batch. Skip the delay for the first source.
    if (i > 0 && results[i - 1].status === "completed") {
      logger.info("Waiting 15s between sources for TPM window reset...");
      await sleep(15_000);
    }
    const result = await ingestSource(sources[i], options);
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
