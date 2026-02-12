import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFetchDocumentSectionTool } from "./fetchDocumentSection.js";
import type { Pool, QueryResult } from "pg";

describe("createFetchDocumentSectionTool", () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let tool: ReturnType<typeof createFetchDocumentSectionTool>;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
    tool = createFetchDocumentSectionTool(mockPool as unknown as Pool);
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("fetch_document_section");
    });

    it("should have a description", () => {
      expect(tool.description).toContain("full text");
      expect(tool.description).toContain("document section");
    });
  });

  describe("fetching by document ID", () => {
    it("should query database with document ID", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            content: "Document content here",
            document_title: "Test Document",
            section_title: null,
            source_url: "https://example.com/doc",
            ngb_id: "usa-swimming",
            topic_domain: "team_selection",
            effective_date: "2024-01-01",
            chunk_index: 0,
          },
        ],
      } as QueryResult);

      await tool.invoke({ documentId: "doc-123" });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("metadata->>'sourceId' = $1"),
        ["doc-123"],
      );
    });

    it("should format single chunk result", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            content: "This is the document content.",
            document_title: "Selection Procedures",
            section_title: null,
            source_url: "https://usopc.org/selection",
            ngb_id: "usa-swimming",
            topic_domain: "team_selection",
            effective_date: "2024-01-01",
            chunk_index: 0,
          },
        ],
      } as QueryResult);

      const result = await tool.invoke({ documentId: "doc-123" });

      expect(result).toContain("Document: Selection Procedures");
      expect(result).toContain("Source: https://usopc.org/selection");
      expect(result).toContain("NGB: usa-swimming");
      expect(result).toContain("Topic: team_selection");
      expect(result).toContain("Effective Date: 2024-01-01");
      expect(result).toContain("Chunks: 1");
      expect(result).toContain("This is the document content.");
    });
  });

  describe("fetching with section title filter", () => {
    it("should apply section title filter with ILIKE", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            content: "Section content",
            document_title: "Test Doc",
            section_title: "Eligibility Requirements",
            source_url: null,
            ngb_id: null,
            topic_domain: null,
            effective_date: null,
            chunk_index: 0,
          },
        ],
      } as QueryResult);

      await tool.invoke({
        documentId: "doc-456",
        sectionTitle: "Eligibility",
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("metadata->>'sectionTitle' ILIKE $2"),
        ["doc-456", "%Eligibility%"],
      );
    });

    it("should include section title in header when provided", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            content: "Section content here",
            document_title: "Full Document",
            section_title: "Selection Criteria",
            source_url: null,
            ngb_id: null,
            topic_domain: null,
            effective_date: null,
            chunk_index: 0,
          },
        ],
      } as QueryResult);

      const result = await tool.invoke({
        documentId: "doc-789",
        sectionTitle: "Selection",
      });

      expect(result).toContain("Section: Selection Criteria");
    });
  });

  describe("multiple chunks", () => {
    it("should concatenate multiple chunks in order", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            content: "First chunk of content.",
            document_title: "Multi-chunk Doc",
            section_title: null,
            source_url: null,
            ngb_id: null,
            topic_domain: null,
            effective_date: null,
            chunk_index: 0,
          },
          {
            content: "Second chunk of content.",
            document_title: "Multi-chunk Doc",
            section_title: null,
            source_url: null,
            ngb_id: null,
            topic_domain: null,
            effective_date: null,
            chunk_index: 1,
          },
          {
            content: "Third chunk of content.",
            document_title: "Multi-chunk Doc",
            section_title: null,
            source_url: null,
            ngb_id: null,
            topic_domain: null,
            effective_date: null,
            chunk_index: 2,
          },
        ],
      } as QueryResult);

      const result = await tool.invoke({ documentId: "doc-multi" });

      expect(result).toContain("Chunks: 3");
      expect(result).toContain("First chunk of content.");
      expect(result).toContain("Second chunk of content.");
      expect(result).toContain("Third chunk of content.");
      // Should be separated by double newlines
      expect(result).toContain("First chunk of content.\n\nSecond chunk");
    });

    it("should order chunks by chunk_index", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { content: "Chunk 0", document_title: "Doc", chunk_index: 0 },
          { content: "Chunk 1", document_title: "Doc", chunk_index: 1 },
        ],
      } as QueryResult);

      // Verify the query includes ORDER BY
      await tool.invoke({ documentId: "doc-123" });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY"),
        expect.any(Array),
      );
    });
  });

  describe("no results", () => {
    it("should return helpful message when document not found", async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as unknown as QueryResult);

      const result = await tool.invoke({ documentId: "nonexistent-doc" });

      expect(result).toContain('No document found with ID "nonexistent-doc"');
      expect(result).toContain("Verify the document ID");
    });

    it("should include section in error message when section filter used", async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as unknown as QueryResult);

      const result = await tool.invoke({
        documentId: "doc-123",
        sectionTitle: "Missing Section",
      });

      expect(result).toContain('section matching "Missing Section"');
    });
  });

  describe("error handling", () => {
    it("should handle database errors gracefully", async () => {
      mockPool.query.mockRejectedValue(new Error("Connection refused"));

      const result = await tool.invoke({ documentId: "doc-123" });

      expect(result).toContain("Failed to retrieve document section");
      expect(result).toContain("Connection refused");
    });

    it("should handle non-Error exceptions", async () => {
      mockPool.query.mockRejectedValue("Database timeout");

      const result = await tool.invoke({ documentId: "doc-123" });

      expect(result).toContain("Failed to retrieve document section");
      expect(result).toContain("Database timeout");
    });
  });

  describe("metadata handling", () => {
    it("should handle null metadata fields gracefully", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            content: "Content with minimal metadata",
            document_title: null,
            section_title: null,
            source_url: null,
            ngb_id: null,
            topic_domain: null,
            effective_date: null,
            chunk_index: 0,
          },
        ],
      } as QueryResult);

      const result = await tool.invoke({ documentId: "doc-minimal" });

      // Should not include labels for null fields
      expect(result).not.toContain("Document:");
      expect(result).not.toContain("Source:");
      expect(result).not.toContain("NGB:");
      expect(result).not.toContain("Topic:");
      expect(result).not.toContain("Effective Date:");
      // But should still have content
      expect(result).toContain("Content with minimal metadata");
      expect(result).toContain("Chunks: 1");
    });

    it("should include all metadata fields when available", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            content: "Full metadata content",
            document_title: "Complete Document",
            section_title: "Full Section",
            source_url: "https://full.example.com",
            ngb_id: "full-ngb",
            topic_domain: "governance",
            effective_date: "2025-06-15",
            chunk_index: 0,
          },
        ],
      } as QueryResult);

      const result = await tool.invoke({
        documentId: "doc-full",
        sectionTitle: "Full",
      });

      expect(result).toContain("Document: Complete Document");
      expect(result).toContain("Section: Full Section");
      expect(result).toContain("Source: https://full.example.com");
      expect(result).toContain("NGB: full-ngb");
      expect(result).toContain("Topic: governance");
      expect(result).toContain("Effective Date: 2025-06-15");
    });
  });

  describe("result formatting", () => {
    it("should separate header from content with divider", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            content: "Document body text",
            document_title: "Test Doc",
            section_title: null,
            source_url: null,
            ngb_id: null,
            topic_domain: null,
            effective_date: null,
            chunk_index: 0,
          },
        ],
      } as QueryResult);

      const result = await tool.invoke({ documentId: "doc-123" });

      expect(result).toContain("---");
      const [header, body] = result.split("---");
      expect(header).toContain("Document: Test Doc");
      expect(body).toContain("Document body text");
    });
  });
});
