import type { PromptEntity } from "@usopc/shared";

let entityRef: PromptEntity | null = null;

const promptCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function initPromptLoader(entity: PromptEntity): void {
  entityRef = entity;
  promptCache.clear();
}

/**
 * Load a prompt by name from DynamoDB with TTL cache.
 * Falls back to the provided default if DynamoDB is unavailable.
 */
export async function loadPrompt(
  name: string,
  fallback: string,
): Promise<string> {
  const now = Date.now();
  const cached = promptCache.get(name);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.content;
  }

  if (!entityRef) {
    return fallback;
  }

  try {
    const prompt = await entityRef.get(name);
    if (prompt) {
      promptCache.set(name, { content: prompt.content, timestamp: now });
      return prompt.content;
    }
    return fallback;
  } catch {
    return fallback;
  }
}
