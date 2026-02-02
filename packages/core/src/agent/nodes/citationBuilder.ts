import { logger } from "@usopc/shared";
import type { AgentState } from "../state.js";
import type { Citation } from "../../types/index.js";

const log = logger.child({ service: "citation-builder-node" });

/**
 * CITATION_BUILDER node.
 *
 * Validates and formats source citations from retrieved documents.
 * Ensures all cited sources are properly attributed with titles, URLs,
 * document types, sections, and effective dates.
 */
export async function citationBuilderNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  for (const doc of state.retrievedDocuments) {
    const key =
      (doc.metadata.sourceUrl ?? "") +
      "|" +
      (doc.metadata.sectionTitle ?? "") +
      "|" +
      (doc.metadata.documentTitle ?? "");

    if (seen.has(key)) continue;
    seen.add(key);

    citations.push({
      title: doc.metadata.documentTitle ?? "Unknown Document",
      url: doc.metadata.sourceUrl,
      documentType: doc.metadata.documentType ?? "document",
      section: doc.metadata.sectionTitle,
      effectiveDate: doc.metadata.effectiveDate,
      snippet: doc.content.slice(0, 200) + (doc.content.length > 200 ? "..." : ""),
    });
  }

  log.info("Citations built", { count: citations.length });

  return { citations };
}
