import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import type { RetrievedDocument, DocumentMetadata } from "../types/index.js";
import { RETRIEVAL_CONFIG } from "../config/index.js";
import { logger } from "@usopc/shared";

const searchKnowledgeBaseSchema = z.object({
  query: z
    .string()
    .describe(
      "The search query. Use specific terms and mention the sport or NGB name if known.",
    ),
  ngbIds: z
    .array(z.string())
    .optional()
    .describe(
      "Optional list of NGB identifiers to narrow the search (e.g. ['usa_swimming', 'us_rowing']).",
    ),
  topicDomain: z
    .string()
    .optional()
    .describe(
      "Optional topic domain to filter results (e.g. 'team_selection', 'safesport', 'anti_doping').",
    ),
  topK: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of results to return. Defaults to 5."),
});

/**
 * Factory that creates the search_knowledge_base tool with an injected
 * PGVectorStore instance. This allows the tool to be used in different
 * environments without hard-coding the database dependency.
 */
export function createSearchKnowledgeBaseTool(vectorStore: PGVectorStore) {
  return tool(
    async ({ query, ngbIds, topicDomain, topK }): Promise<string> => {
      const log = logger.child({ tool: "search_knowledge_base" });
      log.debug("Searching knowledge base", {
        query,
        ngbIds,
        topicDomain,
        topK,
      });

      try {
        const k = topK ?? RETRIEVAL_CONFIG.narrowFilterTopK;

        // Build metadata filter if NGB or topic domain constraints are provided
        const filter: Record<string, unknown> = {};
        if (ngbIds && ngbIds.length > 0) {
          filter.ngbId = { in: ngbIds };
        }
        if (topicDomain) {
          filter.topicDomain = topicDomain;
        }

        const hasFilter = Object.keys(filter).length > 0;

        const results = await vectorStore.similaritySearchWithScore(
          query,
          hasFilter ? k : RETRIEVAL_CONFIG.broadenFilterTopK,
          hasFilter ? filter : undefined,
        );

        if (results.length === 0) {
          return "No relevant documents found in the knowledge base for the given query. Try rephrasing or broadening your search terms.";
        }

        const documents: RetrievedDocument[] = results.map(([doc, score]) => ({
          content: doc.pageContent,
          metadata: doc.metadata as DocumentMetadata,
          score,
        }));

        // Format results as a structured string for the LLM
        const formatted = documents
          .map((doc, index) => {
            const meta = doc.metadata;
            const parts: string[] = [
              `--- Result ${index + 1} (score: ${doc.score.toFixed(3)}) ---`,
            ];

            if (meta.documentTitle) {
              parts.push(`Document: ${meta.documentTitle}`);
            }
            if (meta.sectionTitle) {
              parts.push(`Section: ${meta.sectionTitle}`);
            }
            if (meta.ngbId) {
              parts.push(`NGB: ${meta.ngbId}`);
            }
            if (meta.topicDomain) {
              parts.push(`Topic: ${meta.topicDomain}`);
            }
            if (meta.sourceUrl) {
              parts.push(`Source: ${meta.sourceUrl}`);
            }
            if (meta.effectiveDate) {
              parts.push(`Effective Date: ${meta.effectiveDate}`);
            }

            parts.push(""); // blank line before content
            parts.push(doc.content);

            return parts.join("\n");
          })
          .join("\n\n");

        log.debug("Knowledge base search returned results", {
          count: documents.length,
        });

        return formatted;
      } catch (error) {
        log.error("Knowledge base search failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return `Knowledge base search encountered an error: ${error instanceof Error ? error.message : String(error)}. Please try a different query.`;
      }
    },
    {
      name: "search_knowledge_base",
      description:
        "Search the knowledge base for information about USOPC, NGB governance, team selection, dispute resolution, SafeSport, anti-doping, eligibility, and athlete rights. Use specific terms and mention the sport/NGB if known.",
      schema: searchKnowledgeBaseSchema,
    },
  );
}
