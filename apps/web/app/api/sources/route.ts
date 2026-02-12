import { NextResponse } from "next/server";
import { getPool } from "@usopc/shared";

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
  source_url: "COALESCE(source_url, metadata->>'sourceUrl')",
  document_title: "COALESCE(document_title, metadata->>'documentTitle')",
  document_type: "COALESCE(document_type, metadata->>'documentType')",
  ngb_id: "COALESCE(ngb_id, metadata->>'ngbId')",
  topic_domain: "COALESCE(topic_domain, metadata->>'topicDomain')",
  authority_level: "COALESCE(authority_level, metadata->>'authorityLevel')",
} as const;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "stats") {
      return await handleStats();
    }

    return await handleList(url);
  } catch (error) {
    console.error("Sources API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function handleStats() {
  const db = getPool();

  const result = await db.query<StatsRow>(`
    SELECT
      COUNT(DISTINCT ${COL.source_url}) as total_documents,
      COUNT(DISTINCT ${COL.ngb_id}) as total_organizations,
      MAX(ingested_at) as last_ingested_at
    FROM document_chunks
  `);

  const row = result.rows[0];

  return NextResponse.json({
    totalDocuments: parseInt(row?.total_documents ?? "0", 10),
    totalOrganizations: parseInt(row?.total_organizations ?? "0", 10),
    lastIngestedAt: row?.last_ingested_at?.toISOString() ?? null,
  });
}

async function handleList(url: URL) {
  const db = getPool();

  const search = url.searchParams.get("search");
  const documentType = url.searchParams.get("documentType");
  const topicDomain = url.searchParams.get("topicDomain");
  const ngbId = url.searchParams.get("ngbId");
  const authorityLevel = url.searchParams.get("authorityLevel");
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "20", 10),
    100,
  );

  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let paramIndex = 1;

  if (search) {
    conditions.push(`${COL.document_title} ILIKE $${paramIndex}`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  if (documentType) {
    conditions.push(`${COL.document_type} = $${paramIndex}`);
    values.push(documentType);
    paramIndex++;
  }

  if (topicDomain) {
    conditions.push(`${COL.topic_domain} = $${paramIndex}`);
    values.push(topicDomain);
    paramIndex++;
  }

  if (ngbId) {
    conditions.push(`${COL.ngb_id} = $${paramIndex}`);
    values.push(ngbId);
    paramIndex++;
  }

  if (authorityLevel) {
    conditions.push(`${COL.authority_level} = $${paramIndex}`);
    values.push(authorityLevel);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total grouped rows (must match GROUP BY in data query)
  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*) as total FROM (
      SELECT 1 FROM document_chunks ${whereClause}
      GROUP BY ${COL.source_url}, ${COL.document_title}, ${COL.document_type},
               ${COL.ngb_id}, ${COL.topic_domain}, ${COL.authority_level},
               metadata->>'effectiveDate'
    ) sub`,
    values,
  );

  const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
  const offset = (page - 1) * limit;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  // Fetch documents
  const dataResult = await db.query<DocumentRow>(
    `
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
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    [...values, limit, offset],
  );

  const documents = dataResult.rows.map((row) => ({
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

  return NextResponse.json({
    documents,
    total,
    page,
    limit,
    totalPages,
  });
}
