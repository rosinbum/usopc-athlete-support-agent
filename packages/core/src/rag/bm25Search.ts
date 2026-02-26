import type { Pool } from "pg";

export interface Bm25SearchOptions {
  query: string;
  /** Number of results to return. @default 20 */
  k?: number;
  filter?: {
    ngbIds?: string[];
    topicDomain?: string;
  };
}

export interface Bm25SearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  /** ts_rank_cd score (higher = better). */
  textRank: number;
}

/**
 * BM25-style full-text search using the `content_tsv` tsvector column
 * and GIN index on the `document_chunks` table.
 *
 * Uses `plainto_tsquery` for safe handling of user input (no syntax errors
 * from boolean operators).
 *
 * Filters use the denormalized `ngb_id` and `topic_domain` columns which
 * have B-tree indexes.
 */
export async function bm25Search(
  pool: Pool,
  options: Bm25SearchOptions,
): Promise<Bm25SearchResult[]> {
  const { query, k = 20, filter } = options;

  if (!query.trim()) return [];

  const params: unknown[] = [query];
  const conditions: string[] = [
    "content_tsv @@ plainto_tsquery('english', $1)",
  ];

  let paramIndex = 2;

  if (filter?.ngbIds && filter.ngbIds.length > 0) {
    conditions.push(`ngb_id = ANY($${paramIndex})`);
    params.push(filter.ngbIds);
    paramIndex++;
  }

  if (filter?.topicDomain) {
    conditions.push(`topic_domain = $${paramIndex}`);
    params.push(filter.topicDomain);
    paramIndex++;
  }

  params.push(k);

  const sql = `
    SELECT id, content, metadata,
           ts_rank_cd(content_tsv, plainto_tsquery('english', $1)) AS rank
    FROM document_chunks
    WHERE ${conditions.join(" AND ")}
    ORDER BY rank DESC
    LIMIT $${paramIndex}
  `;

  const result = await pool.query(sql, params);

  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    content: String(row.content),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    textRank: Number(row.rank),
  }));
}
