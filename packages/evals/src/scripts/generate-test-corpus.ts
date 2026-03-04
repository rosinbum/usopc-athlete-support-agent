#!/usr/bin/env tsx

/**
 * One-time script to extract a curated, pre-embedded test corpus from a
 * populated database and write it to packages/evals/fixtures/test-corpus.sql.
 *
 * Usage:
 *   DATABASE_URL=postgres://... tsx src/scripts/generate-test-corpus.ts
 *   # or via pnpm:
 *   DATABASE_URL=postgres://... pnpm --filter @usopc/evals corpus:generate
 *
 * The output SQL file is committed to git and loaded by CI before eval runs.
 * It should only be regenerated when the underlying source documents change.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getPool, closePool } from "@usopc/shared";

// ── Configuration ────────────────────────────────────────────────────────────

const CHUNKS_PER_DOMAIN = 10;
const OUTPUT_PATH = path.resolve(
  import.meta.dirname,
  "../../fixtures/test-corpus.sql",
);

/** Topic domains and their associated search keywords (from retrieval eval dataset). */
const DOMAIN_KEYWORDS: Record<string, string> = {
  team_selection: "selection procedures trials alternate replacement",
  dispute_resolution: "section 9 arbitration grievance appeal dispute",
  safesport: "safesport code conduct misconduct reporting mandatory",
  anti_doping: "prohibited substance TUE therapeutic whereabouts doping USADA",
  eligibility: "citizenship eligibility age requirements transfer",
  governance: "athlete representation board NGB elected USOPC governance",
  athlete_rights: "athlete bill rights marketing sponsorship revenue broadcast",
};

/** NGB IDs to include extra chunks for (matching retrieval eval queries). */
const TARGET_NGBS = ["usa-swimming", "usa-wrestling", "usa-gymnastics"];

// ── Database queries ─────────────────────────────────────────────────────────

interface ChunkRow {
  id: string;
  content: string;
  embedding: string;
  metadata: Record<string, unknown>;
}

async function fetchDomainChunks(
  domain: string,
  keywords: string,
  limit: number,
): Promise<ChunkRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<ChunkRow>(
    `SELECT id, content, embedding::text, metadata
     FROM document_chunks
     WHERE topic_domain = $1
       AND embedding IS NOT NULL
     ORDER BY
       CASE WHEN content_tsv @@ websearch_to_tsquery('english', $2) THEN 0 ELSE 1 END,
       CASE authority_level
         WHEN 'law' THEN 0
         WHEN 'international_rule' THEN 1
         WHEN 'usopc_governance' THEN 2
         WHEN 'usopc_policy_procedure' THEN 3
         WHEN 'independent_office' THEN 4
         WHEN 'anti_doping_national' THEN 5
         WHEN 'ngb_policy_procedure' THEN 6
         WHEN 'games_event_specific' THEN 7
         WHEN 'educational_guidance' THEN 8
         ELSE 9
       END,
       created_at DESC
     LIMIT $3`,
    [domain, keywords, limit],
  );
  return rows;
}

async function fetchNgbChunks(
  ngbId: string,
  excludeIds: Set<string>,
  limit: number,
): Promise<ChunkRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<ChunkRow>(
    `SELECT id, content, embedding::text, metadata
     FROM document_chunks
     WHERE ngb_id = $1
       AND embedding IS NOT NULL
       AND id != ALL($2::uuid[])
     ORDER BY
       CASE authority_level
         WHEN 'ngb_policy_procedure' THEN 0
         WHEN 'games_event_specific' THEN 1
         ELSE 2
       END,
       created_at DESC
     LIMIT $3`,
    [ngbId, [...excludeIds], limit],
  );
  return rows;
}

// ── SQL formatting ───────────────────────────────────────────────────────────

function escapeContent(text: string): string {
  if (text.includes("$CORPUS$")) {
    return `'${text.replace(/'/g, "''")}'`;
  }
  return `$CORPUS$${text}$CORPUS$`;
}

function formatMetadata(meta: Record<string, unknown>): string {
  return `'${JSON.stringify(meta).replace(/'/g, "''")}'::jsonb`;
}

function chunkToSql(chunk: ChunkRow): string {
  return [
    `INSERT INTO document_chunks (id, content, embedding, metadata) VALUES (`,
    `  '${chunk.id}',`,
    `  ${escapeContent(chunk.content)},`,
    `  '${chunk.embedding}',`,
    `  ${formatMetadata(chunk.metadata)}`,
    `) ON CONFLICT (id) DO NOTHING;`,
  ].join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  try {
    const pool = getPool();
    const countResult = await pool.query<{ count: string }>(
      "SELECT count(*) FROM document_chunks WHERE embedding IS NOT NULL",
    );
    const totalCount = countResult.rows[0]!.count;
    console.log(`Database has ${totalCount} embedded chunks`);

    const allChunks: ChunkRow[] = [];
    const seenIds = new Set<string>();

    // Phase 1: Stratified sampling by domain
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const chunks = await fetchDomainChunks(
        domain,
        keywords,
        CHUNKS_PER_DOMAIN,
      );
      console.log(`  ${domain}: ${chunks.length} chunks`);
      for (const chunk of chunks) {
        if (!seenIds.has(chunk.id)) {
          seenIds.add(chunk.id);
          allChunks.push(chunk);
        }
      }
    }

    // Phase 2: Extra NGB-specific chunks
    for (const ngbId of TARGET_NGBS) {
      const chunks = await fetchNgbChunks(ngbId, seenIds, 3);
      console.log(`  NGB ${ngbId}: ${chunks.length} extra chunks`);
      for (const chunk of chunks) {
        if (!seenIds.has(chunk.id)) {
          seenIds.add(chunk.id);
          allChunks.push(chunk);
        }
      }
    }

    console.log(`\nTotal: ${allChunks.length} chunks selected`);

    // Domain distribution summary
    const domainCounts: Record<string, number> = {};
    for (const chunk of allChunks) {
      const domain = (chunk.metadata.topicDomain as string) ?? "unknown";
      domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
    }
    console.log("\nDomain distribution:");
    for (const [domain, count] of Object.entries(domainCounts).sort()) {
      console.log(`  ${domain}: ${count}`);
    }

    // Write SQL
    const header = [
      "-- test-corpus.sql",
      "-- Frozen pre-embedded RAG test corpus for CI evaluations.",
      "-- DO NOT EDIT by hand. Regenerate with:",
      "--   DATABASE_URL=... pnpm --filter @usopc/evals corpus:generate",
      "--",
      `-- Generated: ${new Date().toISOString()}`,
      `-- Chunks: ${allChunks.length}`,
      "-- Model: text-embedding-3-small (1536 dimensions)",
      "",
    ].join("\n");

    const body = allChunks.map(chunkToSql).join("\n\n");
    const sql = `${header}\nBEGIN;\n\n${body}\n\nCOMMIT;\n`;

    await fs.writeFile(OUTPUT_PATH, sql, "utf-8");
    console.log(`\nWritten to ${OUTPUT_PATH}`);
    console.log(
      `File size: ${(Buffer.byteLength(sql) / 1024 / 1024).toFixed(1)} MB`,
    );
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
