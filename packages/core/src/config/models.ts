import type { AgentModelEntity, AgentModelConfig } from "@usopc/shared";

export const MODEL_CONFIG = {
  agent: {
    model: "claude-sonnet-4-20250514",
    temperature: 0.1,
    maxTokens: 4096,
  },
  classifier: {
    model: "claude-haiku-4-5-20251001",
    temperature: 0,
    maxTokens: 1024,
  },
  embeddings: {
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
} as const;

export type ModelConfig = typeof MODEL_CONFIG;

let anthropicApiKey: string | undefined;

export function setAnthropicApiKey(key: string): void {
  anthropicApiKey = key;
}

export function getAnthropicApiKey(): string {
  if (!anthropicApiKey) {
    throw new Error(
      "Anthropic API key not set. Call setAnthropicApiKey() before using Anthropic models.",
    );
  }
  return anthropicApiKey;
}

let cachedConfig: ModelConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let entityRef: AgentModelEntity | null = null;

export function initModelConfig(entity: AgentModelEntity): void {
  entityRef = entity;
  cachedConfig = null;
  cacheTimestamp = 0;
}

export async function getModelConfig(): Promise<ModelConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  if (!entityRef) {
    // Not initialized (dev/local mode) — use hardcoded defaults
    return MODEL_CONFIG;
  }

  try {
    const configs = await entityRef.getAll();
    const configMap = new Map<string, AgentModelConfig>(
      configs.map((c) => [c.id, c]),
    );

    const agent = configMap.get("agent");
    const classifier = configMap.get("classifier");
    const embeddings = configMap.get("embeddings");

    cachedConfig = {
      agent: {
        model: agent?.model ?? MODEL_CONFIG.agent.model,
        temperature: agent?.temperature ?? MODEL_CONFIG.agent.temperature,
        maxTokens: agent?.maxTokens ?? MODEL_CONFIG.agent.maxTokens,
      },
      classifier: {
        model: classifier?.model ?? MODEL_CONFIG.classifier.model,
        temperature:
          classifier?.temperature ?? MODEL_CONFIG.classifier.temperature,
        maxTokens: classifier?.maxTokens ?? MODEL_CONFIG.classifier.maxTokens,
      },
      embeddings: {
        model: embeddings?.model ?? MODEL_CONFIG.embeddings.model,
        dimensions:
          embeddings?.dimensions ?? MODEL_CONFIG.embeddings.dimensions,
      },
    } as unknown as ModelConfig;

    cacheTimestamp = now;
    return cachedConfig;
  } catch {
    // DynamoDB unavailable — use fallback defaults
    return MODEL_CONFIG;
  }
}
