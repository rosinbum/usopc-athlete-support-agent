import { createEmbeddings } from "./rag/embeddings.js";
import { createVectorStore } from "./rag/vectorStore.js";
import { createTavilySearchTool } from "./agent/nodes/researcher.js";
import type { TavilySearchLike } from "./agent/nodes/researcher.js";
import { createAgentGraph } from "./agent/graph.js";
import { createAgentModels } from "./config/index.js";

export async function createGraph() {
  const embeddings = createEmbeddings(process.env.OPENAI_API_KEY);
  const vectorStore = await createVectorStore(embeddings);
  const tavilySearch: TavilySearchLike = process.env.TAVILY_API_KEY
    ? (createTavilySearchTool(process.env.TAVILY_API_KEY) as TavilySearchLike)
    : { invoke: async () => "" };

  const { agentModel, classifierModel } = await createAgentModels();

  return createAgentGraph({
    vectorStore,
    tavilySearch,
    agentModel,
    classifierModel,
  });
}
