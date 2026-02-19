import { ChatAnthropic } from "@langchain/anthropic";
import { createEmbeddings } from "./rag/embeddings.js";
import { createVectorStore } from "./rag/vectorStore.js";
import { createTavilySearchTool } from "./agent/nodes/researcher.js";
import type { TavilySearchLike } from "./agent/nodes/researcher.js";
import { createAgentGraph } from "./agent/graph.js";
import { getModelConfig } from "./config/index.js";
import { initConversationMemoryModel } from "./services/conversationMemory.js";

export async function createGraph() {
  const embeddings = createEmbeddings(process.env.OPENAI_API_KEY);
  const vectorStore = await createVectorStore(embeddings);
  const tavilySearch: TavilySearchLike = process.env.TAVILY_API_KEY
    ? (createTavilySearchTool(process.env.TAVILY_API_KEY) as TavilySearchLike)
    : { invoke: async () => "" };

  const modelConfig = await getModelConfig();
  const agentModel = new ChatAnthropic({
    model: modelConfig.agent.model,
    temperature: modelConfig.agent.temperature,
    maxTokens: modelConfig.agent.maxTokens,
  });
  const classifierModel = new ChatAnthropic({
    model: modelConfig.classifier.model,
    temperature: modelConfig.classifier.temperature,
    maxTokens: modelConfig.classifier.maxTokens,
  });

  initConversationMemoryModel(classifierModel);

  return createAgentGraph({
    vectorStore,
    tavilySearch,
    agentModel,
    classifierModel,
  });
}
