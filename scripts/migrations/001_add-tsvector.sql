-- Add tsvector column for full-text search on document_chunks.
-- Weighted fields: title (A), section (B), content (C).
-- This is a stored generated column — PostgreSQL maintains it automatically
-- when content, document_title, or section_title change.

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(document_title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(section_title, '')), 'B') ||
      setweight(to_tsvector('english', content), 'C')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_chunks_content_tsv
  ON document_chunks USING gin (content_tsv);
