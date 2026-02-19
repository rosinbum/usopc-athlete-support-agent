/**
 * Maximum length (in characters) of LLM output accepted for JSON parsing.
 * Prevents memory issues from attempting to parse unexpectedly large responses.
 * Normal classifier/planner output is 200-500 chars; 50KB is extremely generous.
 */
const MAX_LLM_JSON_LENGTH = 50_000;

/**
 * Strips markdown code fences and parses JSON from LLM output.
 * Throws if the input exceeds {@link MAX_LLM_JSON_LENGTH} characters.
 */
export function parseLlmJson<T = Record<string, unknown>>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.length > MAX_LLM_JSON_LENGTH) {
    throw new Error(
      `LLM output too large for JSON parsing (${cleaned.length} chars, max ${MAX_LLM_JSON_LENGTH})`,
    );
  }
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(cleaned) as T;
}
