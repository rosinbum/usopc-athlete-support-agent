/**
 * Builds the prompt for the retrieval expander node.
 *
 * Instructs Haiku to generate reformulated search queries when initial
 * retrieval confidence is low. The model produces synonyms, rephrased
 * variants, and specificity adjustments to improve vector store matches.
 */
export function buildRetrievalExpanderPrompt(
  originalQuery: string,
  topicDomain: string | undefined,
  existingDocTitles: string[],
): string {
  const domainContext = topicDomain
    ? `The query is about "${topicDomain}" in the context of U.S. Olympic and Paralympic governance.`
    : "The query is about U.S. Olympic and Paralympic governance.";

  const existingDocs =
    existingDocTitles.length > 0
      ? `\nDocuments already retrieved (low relevance):\n${existingDocTitles.map((t) => `- ${t}`).join("\n")}`
      : "";

  return `You are a search query reformulation assistant for a USOPC (United States Olympic & Paralympic Committee) knowledge base.

The original search query returned low-confidence results. Generate 3 alternative search queries that might find more relevant documents.

## Original Query

${originalQuery}

## Context

${domainContext}${existingDocs}

## Instructions

Generate exactly 3 reformulated queries. Each should try a different strategy:
1. **Synonym substitution**: Replace key terms with domain-specific synonyms (e.g., "selection criteria" → "qualification standards", "grievance" → "complaint procedure")
2. **Rephrasing**: Restructure the question to match how policy documents typically phrase things
3. **Specificity change**: Either broaden (if too specific) or narrow (if too vague) the query

Respond with ONLY a JSON array of 3 strings. No explanation, no markdown fences.

["query 1", "query 2", "query 3"]`;
}
