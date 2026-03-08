import type { RetrievedDocument, WebSearchResult } from "../types/index.js";
import type { AuthorityLevel } from "@usopc/shared";

/**
 * Maps authority level codes to human-readable labels.
 */
const AUTHORITY_LEVEL_LABELS: Record<AuthorityLevel, string> = {
  law: "Federal/State Law",
  international_rule: "International Rule",
  usopc_governance: "USOPC Governance",
  usopc_policy_procedure: "USOPC Policy",
  independent_office: "Independent Office (SafeSport, Ombuds)",
  anti_doping_national: "USADA Rules",
  ngb_policy_procedure: "NGB Policy",
  games_event_specific: "Games-Specific Rules",
  educational_guidance: "Educational Guidance",
};

/**
 * Formats a single retrieved document into a text block for the prompt context.
 */
export function formatDocument(doc: RetrievedDocument, index: number): string {
  const parts: string[] = [];

  parts.push(`[Document ${index + 1}]`);

  if (doc.metadata.documentTitle) {
    parts.push(`Title: ${doc.metadata.documentTitle}`);
  }
  if (doc.metadata.sectionTitle) {
    parts.push(`Section: ${doc.metadata.sectionTitle}`);
  }
  if (doc.metadata.documentType) {
    parts.push(`Type: ${doc.metadata.documentType}`);
  }
  if (doc.metadata.ngbId) {
    parts.push(`Organization: ${doc.metadata.ngbId}`);
  }
  if (doc.metadata.effectiveDate) {
    parts.push(`Effective Date: ${doc.metadata.effectiveDate}`);
  }
  if (doc.metadata.authorityLevel) {
    const label =
      AUTHORITY_LEVEL_LABELS[doc.metadata.authorityLevel] ||
      doc.metadata.authorityLevel;
    parts.push(`Authority Level: ${label}`);
  }
  if (doc.metadata.sourceUrl) {
    parts.push(`Source: ${doc.metadata.sourceUrl}`);
  }
  if (doc.metadata.alternativeSources?.length) {
    const altLabels = doc.metadata.alternativeSources
      .map((alt) => {
        const altParts: string[] = [];
        if (alt.documentTitle) altParts.push(alt.documentTitle);
        if (alt.sectionTitle) altParts.push(`(${alt.sectionTitle})`);
        if (alt.sourceUrl) altParts.push(`[${alt.sourceUrl}]`);
        return altParts.join(" ") || "Unknown source";
      })
      .join("; ");
    parts.push(`Also found in: ${altLabels}`);
  }
  parts.push(`Relevance Score: ${doc.score.toFixed(4)}`);
  parts.push("---");
  parts.push(doc.content);

  return parts.join("\n");
}

/**
 * Formats a single structured web search result into a text block.
 * Includes authority level label when available.
 */
export function formatWebResult(
  result: WebSearchResult,
  index: number,
): string {
  const parts: string[] = [];

  parts.push(`[Web Result ${index + 1}]`);
  parts.push(`Title: ${result.title}`);
  parts.push(`URL: ${result.url}`);
  if (result.authorityLevel) {
    const label =
      AUTHORITY_LEVEL_LABELS[result.authorityLevel] || result.authorityLevel;
    parts.push(`Authority Level: ${label}`);
  }
  parts.push(`Relevance Score: ${result.score.toFixed(4)}`);
  parts.push("---");
  parts.push(result.content);

  return parts.join("\n");
}

/**
 * Formats web search results into a text block for the prompt context.
 * Legacy path for unstructured string results.
 */
export function formatWebResults(results: string[]): string {
  if (results.length === 0) return "";

  const parts: string[] = ["\n[Web Search Results]"];

  results.forEach((result, index) => {
    parts.push(`\n[Web Result ${index + 1}]`);
    parts.push(result);
  });

  return parts.join("\n");
}

/**
 * Union type for interleaving KB documents and web results by normalized score.
 */
type ScoredItem =
  | { kind: "doc"; doc: RetrievedDocument; normalizedScore: number }
  | { kind: "web"; result: WebSearchResult; normalizedScore: number };

/**
 * Builds the full context string from retrieved documents and web results.
 *
 * When structured `webSearchResultUrls` are provided, KB documents and web
 * results are interleaved by normalized score so the synthesizer sees them
 * in relevance order with authority labels.
 *
 * Falls back to legacy append mode when only `webSearchResults` strings are
 * available (backward compat).
 */
export function buildContext(state: {
  retrievedDocuments: RetrievedDocument[];
  webSearchResults: string[];
  webSearchResultUrls?: WebSearchResult[];
}): string {
  const hasStructuredWeb =
    state.webSearchResultUrls && state.webSearchResultUrls.length > 0;

  // Interleaved mode: merge KB docs + structured web results by normalized score
  if (hasStructuredWeb) {
    const docs = state.retrievedDocuments;
    const webResults = state.webSearchResultUrls!;

    // Compute max scores for normalization (avoid division by zero)
    const maxDocScore =
      docs.length > 0 ? Math.max(...docs.map((d) => d.score)) : 1;
    const maxWebScore =
      webResults.length > 0 ? Math.max(...webResults.map((w) => w.score)) : 1;

    const items: ScoredItem[] = [
      ...docs.map(
        (doc): ScoredItem => ({
          kind: "doc",
          doc,
          normalizedScore: maxDocScore > 0 ? doc.score / maxDocScore : 0,
        }),
      ),
      ...webResults.map(
        (result): ScoredItem => ({
          kind: "web",
          result,
          normalizedScore: maxWebScore > 0 ? result.score / maxWebScore : 0,
        }),
      ),
    ];

    // Sort by normalized score descending
    items.sort((a, b) => b.normalizedScore - a.normalizedScore);

    // Format each item with sequential indexing per type
    let docIndex = 0;
    let webIndex = 0;
    const formatted = items.map((item) => {
      if (item.kind === "doc") {
        return formatDocument(item.doc, docIndex++);
      } else {
        return formatWebResult(item.result, webIndex++);
      }
    });

    if (formatted.length === 0) {
      return "No documents or search results were found for this query.";
    }

    return formatted.join("\n\n");
  }

  // Legacy mode: KB docs first, then append web strings
  const contextParts: string[] = [];

  if (state.retrievedDocuments.length > 0) {
    const formattedDocs = state.retrievedDocuments.map((doc, i) =>
      formatDocument(doc, i),
    );
    contextParts.push(formattedDocs.join("\n\n"));
  }

  if (state.webSearchResults.length > 0) {
    contextParts.push(formatWebResults(state.webSearchResults));
  }

  if (contextParts.length === 0) {
    return "No documents or search results were found for this query.";
  }

  return contextParts.join("\n\n");
}
