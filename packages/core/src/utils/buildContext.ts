import type { RetrievedDocument } from "../types/index.js";
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
 * Formats web search results into a text block for the prompt context.
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
 * Builds the full context string from retrieved documents and web results.
 */
export function buildContext(state: {
  retrievedDocuments: RetrievedDocument[];
  webSearchResults: string[];
}): string {
  const contextParts: string[] = [];

  // Format retrieved documents
  if (state.retrievedDocuments.length > 0) {
    const formattedDocs = state.retrievedDocuments.map((doc, i) =>
      formatDocument(doc, i),
    );
    contextParts.push(formattedDocs.join("\n\n"));
  }

  // Append web search results if available
  if (state.webSearchResults.length > 0) {
    contextParts.push(formatWebResults(state.webSearchResults));
  }

  if (contextParts.length === 0) {
    return "No documents or search results were found for this query.";
  }

  return contextParts.join("\n\n");
}
