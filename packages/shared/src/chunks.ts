import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkMetadataUpdates {
  title?: string;
  documentType?: string;
  topicDomains?: string[];
  ngbId?: string | null;
  authorityLevel?: string;
}

// ---------------------------------------------------------------------------
// deleteChunksBySourceId
// ---------------------------------------------------------------------------

/**
 * Delete all document_chunks rows whose metadata->>'sourceId' matches.
 * Returns the number of rows deleted.
 */
export async function deleteChunksBySourceId(
  pool: Pool,
  sourceId: string,
): Promise<number> {
  const result = await pool.query(
    `DELETE FROM document_chunks WHERE metadata->>'sourceId' = $1`,
    [sourceId],
  );
  return result.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// updateChunkMetadataBySourceId
// ---------------------------------------------------------------------------

/**
 * Update chunk metadata and denormalized columns in-place for a given source.
 *
 * Maps source config fields to their chunk equivalents:
 * - title       → metadata.documentTitle + document_title column
 * - documentType → metadata.documentType + document_type column
 * - topicDomains → metadata.topicDomain (first), metadata.topicDomains + topic_domain column
 * - ngbId       → metadata.ngbId + ngb_id column
 * - authorityLevel → metadata.authorityLevel + authority_level column
 *
 * Returns the number of rows updated.
 */
export async function updateChunkMetadataBySourceId(
  pool: Pool,
  sourceId: string,
  updates: ChunkMetadataUpdates,
): Promise<number> {
  // Build the JSONB patch and extra column updates linearly.
  // Final params: $1 = sourceId, $2 = jsonb patch, $3+ = column values
  const jsonbPatch: Record<string, unknown> = {};
  const extraClauses: string[] = [];
  const extraParams: unknown[] = [];

  if (updates.title !== undefined) {
    jsonbPatch.documentTitle = updates.title;
    extraClauses.push(`document_title = $${extraParams.length + 3}`);
    extraParams.push(updates.title);
  }

  if (updates.documentType !== undefined) {
    jsonbPatch.documentType = updates.documentType;
    extraClauses.push(`document_type = $${extraParams.length + 3}`);
    extraParams.push(updates.documentType);
  }

  if (updates.topicDomains !== undefined) {
    jsonbPatch.topicDomain = updates.topicDomains[0] ?? null;
    jsonbPatch.topicDomains = updates.topicDomains;
    extraClauses.push(`topic_domain = $${extraParams.length + 3}`);
    extraParams.push(updates.topicDomains[0] ?? null);
  }

  if (updates.ngbId !== undefined) {
    jsonbPatch.ngbId = updates.ngbId;
    extraClauses.push(`ngb_id = $${extraParams.length + 3}`);
    extraParams.push(updates.ngbId);
  }

  if (updates.authorityLevel !== undefined) {
    jsonbPatch.authorityLevel = updates.authorityLevel;
    extraClauses.push(`authority_level = $${extraParams.length + 3}`);
    extraParams.push(updates.authorityLevel);
  }

  if (Object.keys(jsonbPatch).length === 0) {
    return 0;
  }

  const setClauses = [`metadata = metadata || $2::jsonb`, ...extraClauses];
  const params: unknown[] = [
    sourceId,
    JSON.stringify(jsonbPatch),
    ...extraParams,
  ];

  const sql = `UPDATE document_chunks SET ${setClauses.join(", ")} WHERE metadata->>'sourceId' = $1`;
  const result = await pool.query(sql, params);
  return result.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// countChunksBySourceId
// ---------------------------------------------------------------------------

/**
 * Count the number of document_chunks for a given source.
 */
export async function countChunksBySourceId(
  pool: Pool,
  sourceId: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM document_chunks WHERE metadata->>'sourceId' = $1`,
    [sourceId],
  );
  return result.rows[0]?.count ?? 0;
}
