import type { Document } from "@langchain/core/documents";
import { NGB_ID_SET, logger } from "@usopc/shared";
import type { IngestionSource } from "../pipeline.js";

const log = logger.child({ service: "metadata-enricher" });

/**
 * Enrich every chunk with metadata derived from the ingestion source
 * definition.  This ensures that downstream retrieval can filter by NGB,
 * topic domain, document type, etc.
 */
export function enrichMetadata(
  chunks: Document[],
  source: IngestionSource,
  options?: { s3Key?: string | undefined } | undefined,
): Document[] {
  if (source.ngbId && !NGB_ID_SET.has(source.ngbId)) {
    log.warn(
      "Source has unrecognized ngbId — verify data/sport-organizations.json",
      {
        sourceId: source.id,
        ngbId: source.ngbId,
      },
    );
  }

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
      ...(options?.s3Key ? { s3Key: options.s3Key } : {}),
    },
  }));
}
