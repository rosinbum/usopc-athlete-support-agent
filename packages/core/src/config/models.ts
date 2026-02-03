export const MODEL_CONFIG = {
  agent: {
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.1,
    maxTokens: 4096,
  },
  classifier: {
    model: "claude-3-haiku-20240307",
    temperature: 0,
    maxTokens: 1024,
  },
  embeddings: {
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
} as const;
