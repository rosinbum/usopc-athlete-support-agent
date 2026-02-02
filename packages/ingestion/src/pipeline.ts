import type { Document } from "@langchain/core/documents";
import { createLogger } from "@usopc/shared";
import { createEmbeddings, createVectorStore } from "@usopc/core/src/rag/index";
import { loadPdf } from "./loaders/pdfLoader.js";
import { loadWeb } from "./loaders/webLoader.js";
import { loadHtml } from "./loaders/htmlLoader.js";
import { cleanText } from "./transformers/cleaner.js";
import { splitDocuments, createSplitter } from "./transformers/splitter.js";
import { enrichMetadata } from "./transformers/metadataEnricher.js";
import { extractSections } from "./transformers/sectionExtractor.js";

const logger = createLogger({ service: "ingestion-pipeline" });

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
    logger.info(`Loaded ${rawDocs.length} document(s) from ${source.url}`, {
      sourceId: source.id,
    });

    // 2. Clean content
    const cleanedDocs = cleanDocuments(rawDocs);

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

    // 6. Generate embeddings & store in pgvector
    const embeddings = createEmbeddings(options.openaiApiKey);
    const vectorStore = await createVectorStore(embeddings, {
      connectionString: options.databaseUrl,
    });

    await vectorStore.addDocuments(withSections);

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
  for (const source of sources) {
    const result = await ingestSource(source, options);
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
