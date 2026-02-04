import { Document } from "@langchain/core/documents";
import pdfParse from "pdf-parse";
import { readFile } from "node:fs/promises";
import { fetchWithRetry } from "./fetchWithRetry.js";

/**
 * Load a PDF from a URL or local file path and return its text content as
 * a {@link Document} array.
 *
 * - If `source` starts with `http://` or `https://`, the PDF is fetched via
 *   fetchWithRetry with automatic retry on transient failures.
 * - Otherwise `source` is treated as a local file path.
 *
 * Each PDF is returned as a single {@link Document} (pdf-parse extracts the
 * full text).  The upstream splitter is responsible for chunking.
 */
export async function loadPdf(source: string): Promise<Document[]> {
  let buffer: Buffer;

  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetchWithRetry(
      source,
      {
        headers: {
          "User-Agent": "USOPC-Ingestion/1.0",
          Accept: "application/pdf",
        },
      },
      {
        timeoutMs: 120000, // 120 second timeout for PDFs (larger files)
      },
    );

    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    buffer = await readFile(source);
  }

  const parsed = await pdfParse(buffer);

  if (!parsed.text || parsed.text.trim().length === 0) {
    throw new Error(`PDF at ${source} produced no extractable text`);
  }

  return [
    new Document({
      pageContent: parsed.text,
      metadata: {
        source,
        format: "pdf",
        pages: parsed.numpages,
      },
    }),
  ];
}
