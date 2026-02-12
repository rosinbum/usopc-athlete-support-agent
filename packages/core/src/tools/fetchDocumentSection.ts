import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Pool } from "pg";
import { logger } from "@usopc/shared";

const fetchDocumentSectionSchema = z.object({
  documentId: z
    .string()
    .describe(
      "The unique identifier of the document to retrieve (from search result metadata).",
    ),
  sectionTitle: z
    .string()
    .optional()
    .describe(
      "Optional section title to narrow retrieval to a specific section of the document.",
    ),
});

interface DocumentChunkRow {
  content: string;
  document_title: string | null;
  section_title: string | null;
  source_url: string | null;
  ngb_id: string | null;
  topic_domain: string | null;
  effective_date: string | null;
  chunk_index: number;
}

/**
 * Factory that creates the fetch_document_section tool with an injected
 * Postgres connection pool. The tool queries the `document_chunks` table
 * directly for full-text retrieval of specific document sections.
 */
export function createFetchDocumentSectionTool(pool: Pool) {
  return tool(
    async ({ documentId, sectionTitle }): Promise<string> => {
      const log = logger.child({ tool: "fetch_document_section" });
      log.debug("Fetching document section", { documentId, sectionTitle });

      try {
        let query: string;
        let params: (string | undefined)[];

        if (sectionTitle) {
          query = `
            SELECT
              content,
              metadata->>'documentTitle' AS document_title,
              metadata->>'sectionTitle' AS section_title,
              metadata->>'sourceUrl' AS source_url,
              metadata->>'ngbId' AS ngb_id,
              metadata->>'topicDomain' AS topic_domain,
              metadata->>'effectiveDate' AS effective_date,
              metadata->>'chunkIndex' AS chunk_index
            FROM document_chunks
            WHERE metadata->>'sourceId' = $1
              AND metadata->>'sectionTitle' ILIKE $2
            ORDER BY (metadata->>'chunkIndex')::int ASC
          `;
          params = [documentId, `%${sectionTitle}%`];
        } else {
          query = `
            SELECT
              content,
              metadata->>'documentTitle' AS document_title,
              metadata->>'sectionTitle' AS section_title,
              metadata->>'sourceUrl' AS source_url,
              metadata->>'ngbId' AS ngb_id,
              metadata->>'topicDomain' AS topic_domain,
              metadata->>'effectiveDate' AS effective_date,
              metadata->>'chunkIndex' AS chunk_index
            FROM document_chunks
            WHERE metadata->>'sourceId' = $1
            ORDER BY (metadata->>'chunkIndex')::int ASC
          `;
          params = [documentId];
        }

        const result = await pool.query<DocumentChunkRow>(query, params);

        if (result.rows.length === 0) {
          const detail = sectionTitle
            ? ` with section matching "${sectionTitle}"`
            : "";
          return `No document found with ID "${documentId}"${detail}. Verify the document ID from a previous search result.`;
        }

        const firstRow = result.rows[0];

        // Build a header with metadata
        const header: string[] = [];
        if (firstRow.document_title) {
          header.push(`Document: ${firstRow.document_title}`);
        }
        if (sectionTitle && firstRow.section_title) {
          header.push(`Section: ${firstRow.section_title}`);
        }
        if (firstRow.source_url) {
          header.push(`Source: ${firstRow.source_url}`);
        }
        if (firstRow.ngb_id) {
          header.push(`NGB: ${firstRow.ngb_id}`);
        }
        if (firstRow.topic_domain) {
          header.push(`Topic: ${firstRow.topic_domain}`);
        }
        if (firstRow.effective_date) {
          header.push(`Effective Date: ${firstRow.effective_date}`);
        }
        header.push(`Chunks: ${result.rows.length}`);

        // Concatenate all chunk contents in order
        const fullText = result.rows.map((row) => row.content).join("\n\n");

        const output = header.join("\n") + "\n\n---\n\n" + fullText;

        log.debug("Document section fetch succeeded", {
          documentId,
          chunks: result.rows.length,
        });

        return output;
      } catch (error) {
        log.error("Document section fetch failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return `Failed to retrieve document section: ${error instanceof Error ? error.message : String(error)}.`;
      }
    },
    {
      name: "fetch_document_section",
      description:
        "Retrieve the full text of a specific document section from the knowledge base. Use when you need more context than the initial search results provide.",
      schema: fetchDocumentSectionSchema,
    },
  );
}
