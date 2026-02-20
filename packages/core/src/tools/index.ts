import type { StructuredToolInterface } from "@langchain/core/tools";
import type { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import type { Pool } from "pg";
import type { SportOrgEntity } from "@usopc/shared";

import { createSearchKnowledgeBaseTool } from "./searchKnowledgeBase.js";
import { createWebSearchTool, type WebSearchToolOptions } from "./webSearch.js";
import { createLookupSportOrgTool } from "./lookupSportOrg.js";
import { createCalculateDeadlineTool } from "./calculateDeadline.js";
import { createLookupContactTool } from "./lookupContact.js";
import { createFetchDocumentSectionTool } from "./fetchDocumentSection.js";

export {
  createSearchKnowledgeBaseTool,
  createWebSearchTool,
  createLookupSportOrgTool,
  createCalculateDeadlineTool,
  createLookupContactTool,
  createFetchDocumentSectionTool,
};

export type { WebSearchToolOptions };

/**
 * Dependencies required to instantiate the full tool suite.
 */
export interface ToolDependencies {
  /** PGVectorStore instance for semantic search over the knowledge base. */
  vectorStore: PGVectorStore;
  /** Postgres connection pool for direct document chunk queries. */
  pool: Pool;
  /** Optional Tavily API key. Falls back to TAVILY_API_KEY env var. */
  tavilyApiKey?: string;
  /** SportOrgEntity instance for DynamoDB sport organization lookups. */
  sportOrgEntity: SportOrgEntity;
}

/**
 * Create and return all agent tools, fully wired with their dependencies.
 *
 * This is the primary entry point for setting up the tool suite. The returned
 * array can be passed directly to a LangGraph agent or LangChain executor.
 *
 * @example
 * ```ts
 * const tools = getAllTools({
 *   vectorStore,
 *   pool,
 *   tavilyApiKey: process.env.TAVILY_API_KEY,
 *   sportOrgEntity,
 * });
 * ```
 */
export function getAllTools(deps: ToolDependencies): StructuredToolInterface[] {
  return [
    createSearchKnowledgeBaseTool(deps.vectorStore),
    createWebSearchTool(
      deps.tavilyApiKey !== undefined ? { apiKey: deps.tavilyApiKey } : {},
    ),
    createLookupSportOrgTool(deps.sportOrgEntity),
    createCalculateDeadlineTool(),
    createLookupContactTool(),
    createFetchDocumentSectionTool(deps.pool),
  ];
}
