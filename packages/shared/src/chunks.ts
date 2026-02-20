import type { Pool } from "pg";
import { ParamBuilder } from "./paramBuilder.js";

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
  const jsonbPatch: Record<string, unknown> = {};

  if (updates.title !== undefined) {
    jsonbPatch.documentTitle = updates.title;
  }
  if (updates.documentType !== undefined) {
    jsonbPatch.documentType = updates.documentType;
  }
  if (updates.topicDomains !== undefined) {
    jsonbPatch.topicDomain = updates.topicDomains[0] ?? null;
    jsonbPatch.topicDomains = updates.topicDomains;
  }
  if (updates.ngbId !== undefined) {
    jsonbPatch.ngbId = updates.ngbId;
  }
  if (updates.authorityLevel !== undefined) {
    jsonbPatch.authorityLevel = updates.authorityLevel;
  }

  if (Object.keys(jsonbPatch).length === 0) {
    return 0;
  }

  // Use ParamBuilder so that $N indices are derived automatically from
  // insertion order. Adding or reordering params here never silently
  // breaks downstream placeholders.
  const p = new ParamBuilder();
  const sourceIdRef = p.add(sourceId); // $1 — used in WHERE
  const jsonbRef = p.add(JSON.stringify(jsonbPatch)); // $2 — used in SET

  const extraClauses: string[] = [];

  if (updates.title !== undefined) {
    extraClauses.push(`document_title = ${p.add(updates.title)}`);
  }
  if (updates.documentType !== undefined) {
    extraClauses.push(`document_type = ${p.add(updates.documentType)}`);
  }
  if (updates.topicDomains !== undefined) {
    extraClauses.push(
      `topic_domain = ${p.add(updates.topicDomains[0] ?? null)}`,
    );
  }
  if (updates.ngbId !== undefined) {
    extraClauses.push(`ngb_id = ${p.add(updates.ngbId)}`);
  }
  if (updates.authorityLevel !== undefined) {
    extraClauses.push(`authority_level = ${p.add(updates.authorityLevel)}`);
  }

  const setClauses = [
    `metadata = metadata || ${jsonbRef}::jsonb`,
    ...extraClauses,
  ];
  const sql = `UPDATE document_chunks SET ${setClauses.join(", ")} WHERE metadata->>'sourceId' = ${sourceIdRef}`;
  const result = await pool.query(sql, p.values());
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
