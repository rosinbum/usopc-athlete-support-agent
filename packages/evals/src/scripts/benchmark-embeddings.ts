#!/usr/bin/env tsx

/**
 * Embedding Model Benchmark: OpenAI text-embedding-3-small vs Voyage AI voyage-law-2
 * vs Google Gemini gemini-embedding-001
 *
 * Compares retrieval quality (recall@5, recall@10) between the current OpenAI
 * embedding model, Voyage AI's legal-domain specialist model, and Google's
 * Gemini embedding model.
 *
 * Strategy: Creates temporary pgvector tables with alternative embeddings
 * from a sample of existing chunks, then runs the same retrieval test cases
 * against all models.
 *
 * Usage:
 *   pnpm --filter @usopc/evals benchmark:embeddings
 */

import { resolveEnv } from "../helpers/resolveEnv.js";

// Bridge SST Resource bindings → env vars before any SDK is loaded
resolveEnv();

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRawEmbeddings } from "@usopc/core";
import { getPool, closePool } from "@usopc/shared";
import { retrievalExamples } from "../datasets/retrieval.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VOYAGE_MODEL = "voyage-law-2";
const VOYAGE_DIMS = 1024;
const SAMPLE_SIZE = 500;
const VOYAGE_BATCH_SIZE = 64; // Voyage API max batch size
const GEMINI_MODEL = "gemini-embedding-001";
const GEMINI_DIMS = 1536;
const GEMINI_BATCH_SIZE = 64;
const GEMINI_MAX_RETRIES = 3;
const GEMINI_BASE_DELAY_MS = 45_000; // Free tier resets ~every 60s
const K_SMALL = 5;
const K_LARGE = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChunkRow {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

interface TestResult {
  query: string;
  topicDomain: string;
  expectedKeywords: string[];
  openai: ModelResult;
  voyage: ModelResult;
  gemini: ModelResult;
  openaiHybrid: ModelResult;
}

interface ModelResult {
  recall5: number;
  recall10: number;
  latencyMs: number;
  top5Keywords: string[];
  top10Keywords: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evaluateRecall(
  retrievedTexts: string[],
  expectedKeywords: string[],
  k: number,
): { recall: number; keywordsFound: string[] } {
  const topTexts = retrievedTexts.slice(0, k).join(" ").toLowerCase();
  const keywordsFound = expectedKeywords.filter((kw) =>
    topTexts.includes(kw.toLowerCase()),
  );
  return {
    recall:
      expectedKeywords.length > 0
        ? keywordsFound.length / expectedKeywords.length
        : 0,
    keywordsFound,
  };
}

function buildModelResult(
  texts: string[],
  expectedKeywords: string[],
  latencyMs: number,
): ModelResult {
  const r5 = evaluateRecall(texts, expectedKeywords, K_SMALL);
  const r10 = evaluateRecall(texts, expectedKeywords, K_LARGE);
  return {
    recall5: r5.recall,
    recall10: r10.recall,
    latencyMs,
    top5Keywords: r5.keywordsFound,
    top10Keywords: r10.keywordsFound,
  };
}

// ---------------------------------------------------------------------------
// Voyage AI client (direct REST — no SDK needed)
// ---------------------------------------------------------------------------

interface VoyageEmbedResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { total_tokens: number };
}

function getVoyageApiKey(): string {
  const apiKey = process.env.VOYAGEAI_API_KEY;
  if (!apiKey) {
    console.error(
      "✗ VOYAGEAI_API_KEY is not set. Run: sst secret set VoyageaiApiKey <key>",
    );
    process.exit(1);
  }
  return apiKey;
}

async function embedWithVoyage(
  apiKey: string,
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += VOYAGE_BATCH_SIZE) {
    const batch = texts.slice(i, i + VOYAGE_BATCH_SIZE);
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: batch,
        model: VOYAGE_MODEL,
        input_type: inputType,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Voyage AI API error ${res.status} for batch at ${i}: ${body}`,
      );
    }

    const response = (await res.json()) as VoyageEmbedResponse;

    if (!response.data) {
      throw new Error(`Voyage AI returned no data for batch starting at ${i}`);
    }

    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

// ---------------------------------------------------------------------------
// Gemini Embedding client (direct REST — no SDK needed)
// ---------------------------------------------------------------------------

interface GeminiEmbedResponse {
  embeddings: { values: number[] }[];
}

function getGeminiApiKey(): string {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error(
      "✗ GOOGLE_API_KEY is not set. Run: sst secret set GoogleApiKey <key>",
    );
    process.exit(1);
  }
  return apiKey;
}

async function embedWithGemini(
  apiKey: string,
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += GEMINI_BATCH_SIZE) {
    const batch = texts.slice(i, i + GEMINI_BATCH_SIZE);

    const requests = batch.map((text) => ({
      model: `models/${GEMINI_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: GEMINI_DIMS,
    }));

    let response: GeminiEmbedResponse | undefined;
    for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:batchEmbedContents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({ requests }),
        },
      );

      if (res.ok) {
        response = (await res.json()) as GeminiEmbedResponse;
        break;
      }

      if (res.status === 429 && attempt < GEMINI_MAX_RETRIES) {
        const delayMs = GEMINI_BASE_DELAY_MS * 2 ** attempt;
        console.warn(
          `  ⏳ Gemini rate-limited (batch at ${i}), retrying in ${(delayMs / 1000).toFixed(0)}s (attempt ${attempt + 1}/${GEMINI_MAX_RETRIES})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      const body = await res.text();
      throw new Error(
        `Gemini API error ${res.status} for batch at ${i}: ${body}`,
      );
    }

    if (!response?.embeddings) {
      throw new Error(
        `Gemini returned no embeddings for batch starting at ${i}`,
      );
    }

    for (const item of response.embeddings) {
      allEmbeddings.push(item.values);
    }
  }

  return allEmbeddings;
}

// ---------------------------------------------------------------------------
// DB operations
// ---------------------------------------------------------------------------

async function sampleChunks(
  pool: ReturnType<typeof getPool>,
): Promise<ChunkRow[]> {
  console.log(
    `  Sampling ${SAMPLE_SIZE} diverse chunks from document_chunks...`,
  );

  const { rows } = await pool.query<ChunkRow>(
    `SELECT id, content, metadata
     FROM document_chunks
     ORDER BY random()
     LIMIT $1`,
    [SAMPLE_SIZE],
  );

  console.log(`  Got ${rows.length} chunks`);
  return rows;
}

async function createVoyageTable(
  pool: ReturnType<typeof getPool>,
): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS benchmark_chunks_voyage;
    CREATE TABLE benchmark_chunks_voyage (
      id UUID PRIMARY KEY,
      content TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      embedding vector(${VOYAGE_DIMS}) NOT NULL,
      ngb_id TEXT GENERATED ALWAYS AS (metadata->>'ngbId') STORED,
      topic_domain TEXT GENERATED ALWAYS AS (metadata->>'topicDomain') STORED,
      content_tsv tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(metadata->>'documentTitle', '')), 'A') ||
        setweight(to_tsvector('english', coalesce(metadata->>'sectionTitle', '')), 'B') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'C')
      ) STORED
    );
    CREATE INDEX ON benchmark_chunks_voyage USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    CREATE INDEX ON benchmark_chunks_voyage USING gin (content_tsv);
    CREATE INDEX ON benchmark_chunks_voyage (ngb_id);
    CREATE INDEX ON benchmark_chunks_voyage (topic_domain);
  `);
}

async function insertVoyageChunks(
  pool: ReturnType<typeof getPool>,
  chunks: ChunkRow[],
  embeddings: number[][],
): Promise<void> {
  const batchSize = 250;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batchChunks = chunks.slice(i, i + batchSize);
    const batchEmbeddings = embeddings.slice(i, i + batchSize);

    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (let j = 0; j < batchChunks.length; j++) {
      const chunk = batchChunks[j]!;
      const emb = batchEmbeddings[j]!;
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}::vector)`,
      );
      params.push(
        chunk.id,
        chunk.content,
        JSON.stringify(chunk.metadata),
        `[${emb.join(",")}]`,
      );
      paramIdx += 4;
    }

    await pool.query(
      `INSERT INTO benchmark_chunks_voyage (id, content, metadata, embedding)
       VALUES ${values.join(", ")}`,
      params,
    );
  }
}

async function dropVoyageTable(
  pool: ReturnType<typeof getPool>,
): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS benchmark_chunks_voyage");
}

async function createGeminiTable(
  pool: ReturnType<typeof getPool>,
): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS benchmark_chunks_gemini;
    CREATE TABLE benchmark_chunks_gemini (
      id UUID PRIMARY KEY,
      content TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      embedding vector(${GEMINI_DIMS}) NOT NULL,
      ngb_id TEXT GENERATED ALWAYS AS (metadata->>'ngbId') STORED,
      topic_domain TEXT GENERATED ALWAYS AS (metadata->>'topicDomain') STORED,
      content_tsv tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(metadata->>'documentTitle', '')), 'A') ||
        setweight(to_tsvector('english', coalesce(metadata->>'sectionTitle', '')), 'B') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'C')
      ) STORED
    );
    CREATE INDEX ON benchmark_chunks_gemini USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    CREATE INDEX ON benchmark_chunks_gemini USING gin (content_tsv);
    CREATE INDEX ON benchmark_chunks_gemini (ngb_id);
    CREATE INDEX ON benchmark_chunks_gemini (topic_domain);
  `);
}

async function insertGeminiChunks(
  pool: ReturnType<typeof getPool>,
  chunks: ChunkRow[],
  embeddings: number[][],
): Promise<void> {
  const batchSize = 250;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batchChunks = chunks.slice(i, i + batchSize);
    const batchEmbeddings = embeddings.slice(i, i + batchSize);

    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (let j = 0; j < batchChunks.length; j++) {
      const chunk = batchChunks[j]!;
      const emb = batchEmbeddings[j]!;
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}::vector)`,
      );
      params.push(
        chunk.id,
        chunk.content,
        JSON.stringify(chunk.metadata),
        `[${emb.join(",")}]`,
      );
      paramIdx += 4;
    }

    await pool.query(
      `INSERT INTO benchmark_chunks_gemini (id, content, metadata, embedding)
       VALUES ${values.join(", ")}`,
      params,
    );
  }
}

async function dropGeminiTable(
  pool: ReturnType<typeof getPool>,
): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS benchmark_chunks_gemini");
}

// ---------------------------------------------------------------------------
// Search functions
// ---------------------------------------------------------------------------

async function vectorSearchOpenAI(
  pool: ReturnType<typeof getPool>,
  openaiEmbStr: string,
  topK: number,
): Promise<{ texts: string[]; latencyMs: number }> {
  const start = performance.now();

  const { rows } = await pool.query<{ content: string }>(
    `SELECT content
     FROM document_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [openaiEmbStr, topK],
  );

  return {
    texts: rows.map((r) => r.content),
    latencyMs: performance.now() - start,
  };
}

async function vectorSearchVoyage(
  pool: ReturnType<typeof getPool>,
  voyageApiKey: string,
  query: string,
  topK: number,
): Promise<{ texts: string[]; latencyMs: number }> {
  const start = performance.now();
  const voyageEmbeddings = await embedWithVoyage(
    voyageApiKey,
    [query],
    "query",
  );
  const embStr = `[${voyageEmbeddings[0]!.join(",")}]`;

  const { rows } = await pool.query<{ content: string }>(
    `SELECT content
     FROM benchmark_chunks_voyage
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embStr, topK],
  );

  return {
    texts: rows.map((r) => r.content),
    latencyMs: performance.now() - start,
  };
}

async function vectorSearchGemini(
  pool: ReturnType<typeof getPool>,
  geminiApiKey: string,
  query: string,
  topK: number,
): Promise<{ texts: string[]; latencyMs: number }> {
  const start = performance.now();
  const geminiEmbeddings = await embedWithGemini(
    geminiApiKey,
    [query],
    "RETRIEVAL_QUERY",
  );
  const embStr = `[${geminiEmbeddings[0]!.join(",")}]`;

  const { rows } = await pool.query<{ content: string }>(
    `SELECT content
     FROM benchmark_chunks_gemini
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embStr, topK],
  );

  return {
    texts: rows.map((r) => r.content),
    latencyMs: performance.now() - start,
  };
}

async function hybridSearchOpenAI(
  pool: ReturnType<typeof getPool>,
  openaiEmbStr: string,
  query: string,
  topK: number,
): Promise<{ texts: string[]; latencyMs: number }> {
  const start = performance.now();

  // RRF fusion of vector + BM25 (same approach as the production retriever)
  const { rows } = await pool.query<{ content: string }>(
    `WITH vector_results AS (
       SELECT id, content,
              ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS vrank
       FROM document_chunks
       ORDER BY embedding <=> $1::vector
       LIMIT 30
     ),
     bm25_results AS (
       SELECT id, content,
              ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', $2)) DESC) AS brank
       FROM document_chunks
       WHERE content_tsv @@ websearch_to_tsquery('english', $2)
       LIMIT 30
     ),
     fused AS (
       SELECT COALESCE(v.id, b.id) AS id,
              COALESCE(v.content, b.content) AS content,
              COALESCE(1.0 / (60 + v.vrank), 0) + COALESCE(1.0 / (60 + b.brank), 0) AS rrf_score
       FROM vector_results v
       FULL OUTER JOIN bm25_results b ON v.id = b.id
       ORDER BY rrf_score DESC
       LIMIT $3
     )
     SELECT content FROM fused`,
    [openaiEmbStr, query, topK],
  );

  return {
    texts: rows.map((r) => r.content),
    latencyMs: performance.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Embedding Model Benchmark");
  console.log(
    `  OpenAI text-embedding-3-small (1536d) vs Voyage AI ${VOYAGE_MODEL} (${VOYAGE_DIMS}d) vs Gemini ${GEMINI_MODEL} (${GEMINI_DIMS}d)`,
  );
  console.log("═══════════════════════════════════════════════════════════\n");

  // Validate env
  if (!process.env.OPENAI_API_KEY) {
    console.error("✗ OPENAI_API_KEY is not set");
    process.exit(1);
  }

  const pool = getPool();
  const openai = createRawEmbeddings();
  const voyageApiKey = getVoyageApiKey();
  const geminiApiKey = getGeminiApiKey();

  try {
    // Step 1: Sample chunks and embed with Voyage AI + Gemini
    console.log("[1/4] Preparing benchmark tables...");
    const chunks = await sampleChunks(pool);

    if (chunks.length === 0) {
      console.error(
        "✗ No chunks found in document_chunks. Is the DB populated?",
      );
      process.exit(1);
    }

    const chunkTexts = chunks.map((c) => c.content);

    console.log(`  Embedding ${chunks.length} chunks with ${VOYAGE_MODEL}...`);
    const voyageEmbeddings = await embedWithVoyage(
      voyageApiKey,
      chunkTexts,
      "document",
    );
    console.log("  Voyage embeddings computed.");

    console.log(`  Embedding ${chunks.length} chunks with ${GEMINI_MODEL}...`);
    const geminiEmbeddings = await embedWithGemini(
      geminiApiKey,
      chunkTexts,
      "RETRIEVAL_DOCUMENT",
    );
    console.log("  Gemini embeddings computed.");

    console.log("  Creating temp tables and inserting...");
    await createVoyageTable(pool);
    await insertVoyageChunks(pool, chunks, voyageEmbeddings);
    await createGeminiTable(pool);
    await insertGeminiChunks(pool, chunks, geminiEmbeddings);
    console.log("  Done.\n");

    // Step 2: Run retrieval tests
    console.log(
      `[2/4] Running retrieval tests (${retrievalExamples.length} queries)...\n`,
    );

    const results: TestResult[] = [];
    const maxTopK = K_LARGE;

    for (let i = 0; i < retrievalExamples.length; i++) {
      const example = retrievalExamples[i]!;
      const { message, topicDomain } = example.input;
      const { expectedKeywords } = example.expectedOutput;

      process.stdout.write(
        `  [${i + 1}/${retrievalExamples.length}] ${message.slice(0, 60)}...`,
      );

      // Embed with OpenAI once (used by both vector and hybrid search)
      const openaiVec = await openai.embedQuery(message);
      const openaiEmbStr = `[${openaiVec.join(",")}]`;

      // Run all four searches in parallel
      const [openaiResult, voyageResult, geminiResult, hybridResult] =
        await Promise.all([
          vectorSearchOpenAI(pool, openaiEmbStr, maxTopK),
          vectorSearchVoyage(pool, voyageApiKey, message, maxTopK),
          vectorSearchGemini(pool, geminiApiKey, message, maxTopK),
          hybridSearchOpenAI(pool, openaiEmbStr, message, maxTopK),
        ]);

      results.push({
        query: message,
        topicDomain,
        expectedKeywords,
        openai: buildModelResult(
          openaiResult.texts,
          expectedKeywords,
          openaiResult.latencyMs,
        ),
        voyage: buildModelResult(
          voyageResult.texts,
          expectedKeywords,
          voyageResult.latencyMs,
        ),
        gemini: buildModelResult(
          geminiResult.texts,
          expectedKeywords,
          geminiResult.latencyMs,
        ),
        openaiHybrid: buildModelResult(
          hybridResult.texts,
          expectedKeywords,
          hybridResult.latencyMs,
        ),
      });

      console.log(" done");
    }

    // Step 3: Compute and display summary
    console.log("\n[3/4] Computing summary...\n");

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const summary = {
      openai: {
        avgRecall5: avg(results.map((r) => r.openai.recall5)),
        avgRecall10: avg(results.map((r) => r.openai.recall10)),
        avgLatencyMs: avg(results.map((r) => r.openai.latencyMs)),
      },
      voyage: {
        avgRecall5: avg(results.map((r) => r.voyage.recall5)),
        avgRecall10: avg(results.map((r) => r.voyage.recall10)),
        avgLatencyMs: avg(results.map((r) => r.voyage.latencyMs)),
      },
      gemini: {
        avgRecall5: avg(results.map((r) => r.gemini.recall5)),
        avgRecall10: avg(results.map((r) => r.gemini.recall10)),
        avgLatencyMs: avg(results.map((r) => r.gemini.latencyMs)),
      },
      openaiHybrid: {
        avgRecall5: avg(results.map((r) => r.openaiHybrid.recall5)),
        avgRecall10: avg(results.map((r) => r.openaiHybrid.recall10)),
        avgLatencyMs: avg(results.map((r) => r.openaiHybrid.latencyMs)),
      },
    };

    // Print comparison table
    console.log(
      "┌──────────────────────────────┬───────────┬───────────┬───────────┬────────────┐",
    );
    console.log(
      "│ Metric                       │ OpenAI    │ Voyage    │ Gemini    │ OpenAI+BM25│",
    );
    console.log(
      "├──────────────────────────────┼───────────┼───────────┼───────────┼────────────┤",
    );
    console.log(
      `│ Avg Recall@5                 │ ${(summary.openai.avgRecall5 * 100).toFixed(1).padStart(6)}%  │ ${(summary.voyage.avgRecall5 * 100).toFixed(1).padStart(6)}%  │ ${(summary.gemini.avgRecall5 * 100).toFixed(1).padStart(6)}%  │ ${(summary.openaiHybrid.avgRecall5 * 100).toFixed(1).padStart(7)}%  │`,
    );
    console.log(
      `│ Avg Recall@10                │ ${(summary.openai.avgRecall10 * 100).toFixed(1).padStart(6)}%  │ ${(summary.voyage.avgRecall10 * 100).toFixed(1).padStart(6)}%  │ ${(summary.gemini.avgRecall10 * 100).toFixed(1).padStart(6)}%  │ ${(summary.openaiHybrid.avgRecall10 * 100).toFixed(1).padStart(7)}%  │`,
    );
    console.log(
      `│ Avg Latency (ms)             │ ${summary.openai.avgLatencyMs.toFixed(0).padStart(7)}  │ ${summary.voyage.avgLatencyMs.toFixed(0).padStart(7)}  │ ${summary.gemini.avgLatencyMs.toFixed(0).padStart(7)}  │ ${summary.openaiHybrid.avgLatencyMs.toFixed(0).padStart(8)}  │`,
    );
    console.log(
      "└──────────────────────────────┴───────────┴───────────┴───────────┴────────────┘",
    );

    // Per-query detail
    console.log("\nPer-query recall@5:");
    for (const r of results) {
      const oai = (r.openai.recall5 * 100).toFixed(0).padStart(3);
      const voy = (r.voyage.recall5 * 100).toFixed(0).padStart(3);
      const gem = (r.gemini.recall5 * 100).toFixed(0).padStart(3);
      const hyb = (r.openaiHybrid.recall5 * 100).toFixed(0).padStart(3);
      const scores = [
        { name: "OpenAI", val: r.openai.recall5 },
        { name: "Voyage", val: r.voyage.recall5 },
        { name: "Gemini", val: r.gemini.recall5 },
      ];
      const best = scores.reduce((a, b) => (b.val > a.val ? b : a));
      const winner =
        scores.filter((s) => s.val === best.val).length === scores.length
          ? ""
          : ` << ${best.name} wins`;
      console.log(
        `  ${r.query.slice(0, 50).padEnd(50)} OAI:${oai}% VOY:${voy}% GEM:${gem}% HYB:${hyb}%${winner}`,
      );
    }

    // Step 4: Write results
    console.log("\n[4/4] Writing results...");

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const outputDir = path.resolve(__dirname, "../../output");
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, "embedding-benchmark-results.json");
    const output = {
      timestamp: new Date().toISOString(),
      config: {
        openaiModel: "text-embedding-3-small",
        openaiDims: 1536,
        voyageModel: VOYAGE_MODEL,
        voyageDims: VOYAGE_DIMS,
        geminiModel: GEMINI_MODEL,
        geminiDims: GEMINI_DIMS,
        sampleSize: chunks.length,
        testCases: retrievalExamples.length,
      },
      summary,
      results,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`  Results written to ${outputPath}`);

    // Cleanup
    console.log("\n  Dropping temp tables...");
    await dropVoyageTable(pool);
    await dropGeminiTable(pool);
    console.log("  Done.\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  Benchmark complete!");
    console.log("═══════════════════════════════════════════════════════════");
  } catch (err) {
    // Ensure cleanup on error
    try {
      await dropVoyageTable(pool);
      await dropGeminiTable(pool);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
