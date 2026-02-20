import type { Pool } from "pg";
import type { TopicDomain, AuthorityLevel } from "@usopc/shared";
import { ParamBuilder } from "@usopc/shared";

export interface SourceDocument {
  sourceUrl: string;
  documentTitle: string;
  documentType: string | null;
  ngbId: string | null;
  topicDomain: string | null;
  authorityLevel: string | null;
  effectiveDate: string | null;
  ingestedAt: string;
  chunkCount: number;
}

export interface SourcesListResponse {
  documents: SourceDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SourcesStats {
  totalDocuments: number;
  totalOrganizations: number;
  lastIngestedAt: string | null;
}

export interface ListUniqueDocumentsParams {
  search?: string;
  documentType?: string;
  topicDomain?: TopicDomain;
  ngbId?: string;
  authorityLevel?: AuthorityLevel;
  page?: number;
  limit?: number;
}

interface DocumentRow {
  source_url: string;
  document_title: string;
  document_type: string | null;
  ngb_id: string | null;
  topic_domain: string | null;
  authority_level: string | null;
  effective_date: string | null;
  ingested_at: Date;
  chunk_count: string;
}

interface CountRow {
  total: string;
}

interface StatsRow {
  total_documents: string;
  total_organizations: string;
  last_ingested_at: Date | null;
}

const COL = {
  source_url: "source_url",
  document_title: "document_title",
  document_type: "document_type",
  ngb_id: "ngb_id",
  topic_domain: "topic_domain",
  authority_level: "authority_level",
} as const;

/**
 * Escapes PostgreSQL ILIKE wildcard characters (%, _, \) in user-supplied input
 * so they are treated as literals rather than pattern metacharacters.
 * Use in conjunction with the ESCAPE '\' clause on the ILIKE predicate.
 */
export function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Lists unique documents from document_chunks, grouped by source_url.
 * Supports filtering by search, documentType, topicDomain, ngbId, and authorityLevel.
 * Returns paginated results.
 */
export async function listUniqueDocuments(
  pool: Pool,
  params: ListUniqueDocumentsParams,
): Promise<SourcesListResponse> {
  const {
    search,
    documentType,
    topicDomain,
    ngbId,
    authorityLevel,
    page = 1,
    limit = 20,
  } = params;

  // ParamBuilder tracks $N indices automatically so adding or reordering
  // filter conditions never breaks the LIMIT/OFFSET placeholders.
  const p = new ParamBuilder();
  const conditions: string[] = [];

  if (search) {
    conditions.push(
      `${COL.document_title} ILIKE ${p.add(`%${escapeIlike(search)}%`)} ESCAPE '\\'`,
    );
  }

  if (documentType) {
    conditions.push(`${COL.document_type} = ${p.add(documentType)}`);
  }

  if (topicDomain) {
    conditions.push(`${COL.topic_domain} = ${p.add(topicDomain)}`);
  }

  if (ngbId) {
    conditions.push(`${COL.ngb_id} = ${p.add(ngbId)}`);
  }

  if (authorityLevel) {
    conditions.push(`${COL.authority_level} = ${p.add(authorityLevel)}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Snapshot filter params before adding pagination params so the count query
  // receives only the filter values (no LIMIT/OFFSET).
  const filterValues = p.values();

  // Count total grouped rows (must match GROUP BY in data query)
  const countQuery = `
    SELECT COUNT(*) as total FROM (
      SELECT 1 FROM document_chunks
      ${whereClause}
      GROUP BY ${COL.source_url}, ${COL.document_title}, ${COL.document_type},
               ${COL.ngb_id}, ${COL.topic_domain}, ${COL.authority_level}
    ) sub
  `;

  const countResult = await pool.query<CountRow>(countQuery, filterValues);
  const total = parseInt(countResult.rows[0]?.total ?? "0", 10);

  // Calculate pagination
  const offset = (page - 1) * limit;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  // Add pagination params — $N indices continue from where filter params left off.
  const limitRef = p.add(limit);
  const offsetRef = p.add(offset);

  // Fetch documents with pagination
  const dataQuery = `
    SELECT
      ${COL.source_url} as source_url,
      ${COL.document_title} as document_title,
      ${COL.document_type} as document_type,
      ${COL.ngb_id} as ngb_id,
      ${COL.topic_domain} as topic_domain,
      ${COL.authority_level} as authority_level,
      metadata->>'effectiveDate' as effective_date,
      MIN(ingested_at) as ingested_at,
      COUNT(*) as chunk_count
    FROM document_chunks
    ${whereClause}
    GROUP BY ${COL.source_url}, ${COL.document_title}, ${COL.document_type},
             ${COL.ngb_id}, ${COL.topic_domain}, ${COL.authority_level},
             metadata->>'effectiveDate'
    ORDER BY ingested_at DESC
    LIMIT ${limitRef} OFFSET ${offsetRef}
  `;

  const dataResult = await pool.query<DocumentRow>(dataQuery, p.values());

  const documents: SourceDocument[] = dataResult.rows.map((row) => ({
    sourceUrl: row.source_url,
    documentTitle: row.document_title,
    documentType: row.document_type,
    ngbId: row.ngb_id,
    topicDomain: row.topic_domain,
    authorityLevel: row.authority_level,
    effectiveDate: row.effective_date,
    ingestedAt: row.ingested_at.toISOString(),
    chunkCount: parseInt(row.chunk_count, 10),
  }));

  return {
    documents,
    total,
    page,
    limit,
    totalPages,
  };
}

/**
 * Returns aggregate statistics for all sources.
 */
export async function getSourcesStats(pool: Pool): Promise<SourcesStats> {
  const query = `
    SELECT
      COUNT(DISTINCT ${COL.source_url}) as total_documents,
      COUNT(DISTINCT ${COL.ngb_id}) as total_organizations,
      MAX(ingested_at) as last_ingested_at
    FROM document_chunks
  `;

  const result = await pool.query<StatsRow>(query);
  const row = result.rows[0];

  return {
    totalDocuments: parseInt(row?.total_documents ?? "0", 10),
    totalOrganizations: parseInt(row?.total_organizations ?? "0", 10),
    lastIngestedAt: row?.last_ingested_at?.toISOString() ?? null,
  };
}
