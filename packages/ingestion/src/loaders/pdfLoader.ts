import { Document } from "@langchain/core/documents";
import pdfParse from "pdf-parse";
import { readFile } from "node:fs/promises";

/**
 * Load a PDF from a URL or local file path and return its text content as
 * a {@link Document} array.
 *
 * - If `source` starts with `http://` or `https://`, the PDF is fetched via
 *   the Fetch API.
 * - Otherwise `source` is treated as a local file path.
 *
 * Each PDF is returned as a single {@link Document} (pdf-parse extracts the
 * full text).  The upstream splitter is responsible for chunking.
 */
export async function loadPdf(source: string): Promise<Document[]> {
  let buffer: Buffer;

  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source, {
      headers: {
        "User-Agent": "USOPC-Ingestion/1.0",
        Accept: "application/pdf",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch PDF from ${source}: ${response.status} ${response.statusText}`,
      );
    }

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
