import { describe, it, expect } from "vitest";
import type { Document } from "@langchain/core/documents";
import { enrichMetadata } from "./metadataEnricher.js";
import type { IngestionSource } from "../pipeline.js";

describe("enrichMetadata", () => {
  const baseSource: IngestionSource = {
    id: "test-source",
    title: "Test Document",
    documentType: "policy",
    topicDomains: ["governance", "athlete_rights"],
    url: "https://example.com/doc.pdf",
    format: "pdf",
    ngbId: "usa-swimming",
    priority: "high",
    description: "Test document description",
  };

  const createChunks = (count: number): Document[] =>
    Array.from({ length: count }, (_, i) => ({
      pageContent: `Content chunk ${i}`,
      metadata: { page: i },
    }));

  it("adds authority_level to chunk metadata when present in source", () => {
    const sourceWithAuthority: IngestionSource = {
      ...baseSource,
      authorityLevel: "usopc_governance",
    };
    const chunks = createChunks(2);

    const enriched = enrichMetadata(chunks, sourceWithAuthority);

    expect(enriched[0]!.metadata.authorityLevel).toBe("usopc_governance");
    expect(enriched[1]!.metadata.authorityLevel).toBe("usopc_governance");
  });

  it("does not include authority_level when not present in source", () => {
    const chunks = createChunks(1);

    const enriched = enrichMetadata(chunks, baseSource);

    expect(enriched[0]!.metadata.authorityLevel).toBeUndefined();
  });

  it("preserves existing metadata fields", () => {
    const sourceWithAuthority: IngestionSource = {
      ...baseSource,
      authorityLevel: "law",
    };
    const chunks = createChunks(1);

    const enriched = enrichMetadata(chunks, sourceWithAuthority);

    expect(enriched[0]!.metadata.ngbId).toBe("usa-swimming");
    expect(enriched[0]!.metadata.topicDomain).toBe("governance");
    expect(enriched[0]!.metadata.topicDomains).toEqual([
      "governance",
      "athlete_rights",
    ]);
    expect(enriched[0]!.metadata.documentType).toBe("policy");
    expect(enriched[0]!.metadata.sourceUrl).toBe("https://example.com/doc.pdf");
    expect(enriched[0]!.metadata.documentTitle).toBe("Test Document");
    expect(enriched[0]!.metadata.sourceId).toBe("test-source");
    expect(enriched[0]!.metadata.chunkIndex).toBe(0);
    expect(enriched[0]!.metadata.ingestedAt).toBeDefined();
  });

  it("preserves original chunk metadata", () => {
    const chunks: Document[] = [
      {
        pageContent: "Content",
        metadata: { page: 5, customField: "value" },
      },
    ];

    const enriched = enrichMetadata(chunks, baseSource);

    expect(enriched[0]!.metadata.page).toBe(5);
    expect(enriched[0]!.metadata.customField).toBe("value");
  });

  it("sets correct chunk_index for each chunk", () => {
    const sourceWithAuthority: IngestionSource = {
      ...baseSource,
      authorityLevel: "ngb_policy_procedure",
    };
    const chunks = createChunks(3);

    const enriched = enrichMetadata(chunks, sourceWithAuthority);

    expect(enriched[0]!.metadata.chunkIndex).toBe(0);
    expect(enriched[1]!.metadata.chunkIndex).toBe(1);
    expect(enriched[2]!.metadata.chunkIndex).toBe(2);
  });

  it("includes s3Key in metadata when provided via options", () => {
    const chunks = createChunks(2);

    const enriched = enrichMetadata(chunks, baseSource, {
      s3Key: "sources/test-source/abc123.pdf",
    });

    expect(enriched[0]!.metadata.s3Key).toBe("sources/test-source/abc123.pdf");
    expect(enriched[1]!.metadata.s3Key).toBe("sources/test-source/abc123.pdf");
  });

  it("does not include s3Key when not provided in options", () => {
    const chunks = createChunks(1);

    const enriched = enrichMetadata(chunks, baseSource);

    expect(enriched[0]!.metadata.s3Key).toBeUndefined();
  });

  it("does not include s3Key when options.s3Key is undefined", () => {
    const chunks = createChunks(1);

    const enriched = enrichMetadata(chunks, baseSource, {});

    expect(enriched[0]!.metadata.s3Key).toBeUndefined();
  });
});
