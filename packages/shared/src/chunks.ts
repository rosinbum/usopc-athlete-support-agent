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
  // Build the JSONB patch from the updates
  const jsonbPatch: Record<string, unknown> = {};
  const setClauses: string[] = [`metadata = metadata || $2::jsonb`];
  const params: unknown[] = [sourceId]; // $1 = sourceId, $2 = jsonb patch

  if (updates.title !== undefined) {
    jsonbPatch.documentTitle = updates.title;
    setClauses.push(`document_title = $${params.length + 2}`);
    params.push(updates.title); // will be $3, $4, etc.
  }

  if (updates.documentType !== undefined) {
    jsonbPatch.documentType = updates.documentType;
    setClauses.push(`document_type = $${params.length + 2}`);
    params.push(updates.documentType);
  }

  if (updates.topicDomains !== undefined) {
    jsonbPatch.topicDomain = updates.topicDomains[0] ?? null;
    jsonbPatch.topicDomains = updates.topicDomains;
    setClauses.push(`topic_domain = $${params.length + 2}`);
    params.push(updates.topicDomains[0] ?? null);
  }

  if (updates.ngbId !== undefined) {
    jsonbPatch.ngbId = updates.ngbId;
    setClauses.push(`ngb_id = $${params.length + 2}`);
    params.push(updates.ngbId);
  }

  if (updates.authorityLevel !== undefined) {
    jsonbPatch.authorityLevel = updates.authorityLevel;
    setClauses.push(`authority_level = $${params.length + 2}`);
    params.push(updates.authorityLevel);
  }

  if (Object.keys(jsonbPatch).length === 0) {
    return 0;
  }

  // Insert the jsonb patch as $2
  params.splice(1, 0, JSON.stringify(jsonbPatch));

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
