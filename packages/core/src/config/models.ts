export const MODEL_CONFIG = {
  agent: {
    model: "claude-sonnet-4-20250514",
    temperature: 0.1,
    maxTokens: 4096,
  },
  classifier: {
    model: "claude-3-5-haiku-latest",
    temperature: 0,
    maxTokens: 1024,
  },
  embeddings: {
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
} as const;
