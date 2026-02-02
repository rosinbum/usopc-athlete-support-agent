import type { Document } from "@langchain/core/documents";
import type { IngestionSource } from "../pipeline.js";

/**
 * Enrich every chunk with metadata derived from the ingestion source
 * definition.  This ensures that downstream retrieval can filter by NGB,
 * topic domain, document type, etc.
 */
export function enrichMetadata(
  chunks: Document[],
  source: IngestionSource,
): Document[] {
  return chunks.map((chunk, index) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      ngb_id: source.ngbId,
      topic_domain: source.topicDomains[0], // primary domain
      topic_domains: source.topicDomains,
      document_type: source.documentType,
      source_url: source.url,
      document_title: source.title,
      source_id: source.id,
      chunk_index: index,
      ingested_at: new Date().toISOString(),
    },
  }));
}
