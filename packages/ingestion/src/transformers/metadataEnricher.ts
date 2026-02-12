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
      ngbId: source.ngbId,
      topicDomain: source.topicDomains[0], // primary domain
      topicDomains: source.topicDomains,
      documentType: source.documentType,
      sourceUrl: source.url,
      documentTitle: source.title,
      sourceId: source.id,
      chunkIndex: index,
      ingestedAt: new Date().toISOString(),
      authorityLevel: source.authorityLevel,
    },
  }));
}
