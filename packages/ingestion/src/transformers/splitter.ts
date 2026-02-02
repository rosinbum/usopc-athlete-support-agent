import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { Document } from "@langchain/core/documents";

/**
 * Separators tuned for legal / governance documents. The splitter will try
 * the separators in order, falling back to the next when a chunk is still
 * too large.
 */
const LEGAL_SEPARATORS = [
  "\nARTICLE ",
  "\nSECTION ",
  "\nSection ",
  "\nCHAPTER ",
  "\nPART ",
  "\nRule ",
  "\n## ",
  "\n### ",
  "\n\n",
  "\n",
  " ",
];

/**
 * Create a {@link RecursiveCharacterTextSplitter} pre-configured with
 * legal-document separators.
 */
export function createSplitter(options?: {
  chunkSize?: number;
  chunkOverlap?: number;
}): RecursiveCharacterTextSplitter {
  return new RecursiveCharacterTextSplitter({
    chunkSize: options?.chunkSize ?? 1500,
    chunkOverlap: options?.chunkOverlap ?? 200,
    separators: LEGAL_SEPARATORS,
  });
}

/**
 * Split an array of documents using the provided (or default) splitter.
 */
export async function splitDocuments(
  documents: Document[],
  splitter?: RecursiveCharacterTextSplitter,
): Promise<Document[]> {
  const s = splitter ?? createSplitter();
  return await s.splitDocuments(documents);
}
