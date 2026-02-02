export const MODEL_CONFIG = {
  agent: {
    model: "claude-sonnet-4-20250514",
    temperature: 0.1,
    maxTokens: 4096,
  },
  classifier: {
    model: "claude-haiku-4-20250514",
    temperature: 0,
    maxTokens: 1024,
  },
  embeddings: {
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
} as const;
