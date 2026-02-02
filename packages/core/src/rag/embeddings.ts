import { OpenAIEmbeddings } from "@langchain/openai";

export function createEmbeddings(apiKey?: string): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    openAIApiKey: apiKey ?? process.env.OPENAI_API_KEY,
    modelName: "text-embedding-3-small",
    dimensions: 1536,
  });
}
