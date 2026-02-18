import { createEmbeddings } from "./rag/embeddings.js";
import { createVectorStore } from "./rag/vectorStore.js";
import { createTavilySearchTool } from "./agent/nodes/researcher.js";
import type { TavilySearchLike } from "./agent/nodes/researcher.js";
import { createAgentGraph } from "./agent/graph.js";
import { setAnthropicApiKey } from "./config/index.js";

export async function createGraph() {
  // In dev/studio mode, read the key from process.env (set by .env file)
  if (process.env.ANTHROPIC_API_KEY) {
    setAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
  }

  const embeddings = createEmbeddings(process.env.OPENAI_API_KEY);
  const vectorStore = await createVectorStore(embeddings);
  const tavilySearch: TavilySearchLike = process.env.TAVILY_API_KEY
    ? (createTavilySearchTool(process.env.TAVILY_API_KEY) as TavilySearchLike)
    : { invoke: async () => "" };

  return createAgentGraph({ vectorStore, tavilySearch });
}
