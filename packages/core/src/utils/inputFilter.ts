import { logger } from "@usopc/shared";

const log = logger.child({ service: "input-filter" });

/**
 * Common prompt injection patterns. These detect attempts to override
 * system instructions, extract the system prompt, or jailbreak the model.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(your\s+)?instructions/i,
  /you\s+are\s+now\s+(?:a|an|the)\s+/i,
  /\bDAN\b.*\bmode\b/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /show\s+me\s+(your\s+)?(system\s+)?prompt/i,
  /what\s+(are|is)\s+your\s+(system\s+)?(instructions|prompt)/i,
  /repeat\s+(the\s+)?(text|words|instructions)\s+above/i,
  /pretend\s+you\s+(are|have)\s+no\s+restrictions/i,
  /act\s+as\s+if\s+you\s+(have|had)\s+no\s+(rules|restrictions|guidelines)/i,
];

/**
 * Checks if the user's message contains common prompt injection patterns.
 * Returns the matched pattern description if detected, or `null` if clean.
 */
export function detectInjection(content: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      log.warn("Potential prompt injection detected", {
        pattern: pattern.source,
      });
      return pattern.source;
    }
  }
  return null;
}

/**
 * A polite response to return when injection is detected.
 * Does not reveal that injection was detected — just redirects.
 */
export const INJECTION_RESPONSE =
  "I'm designed to help with USOPC governance, athlete rights, anti-doping, SafeSport, and competition eligibility questions. Could you rephrase your question about one of these topics?";
