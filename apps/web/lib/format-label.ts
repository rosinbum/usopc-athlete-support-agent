/**
 * Consolidated label formatting utilities.
 *
 * Replaces 5 inline `formatLabel` implementations that used two distinct
 * algorithms under the same name.
 */

/** Convert a snake_case value to a human-readable label (e.g. "topic_domain" → "Topic Domain"). */
export function snakeToLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Convert a camelCase key to a human-readable label (e.g. "topicDomain" → "Topic Domain"). */
export function camelToLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
