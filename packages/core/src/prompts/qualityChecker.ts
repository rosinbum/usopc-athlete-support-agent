import type { QueryIntent } from "../types/index.js";

/**
 * Builds the quality checker prompt that instructs Haiku to evaluate a
 * synthesized answer for specificity, grounding, and completeness.
 *
 * Returns a prompt string; the model should respond with a JSON object:
 * `{ passed, score, issues, critique }`
 */
export function buildQualityCheckerPrompt(
  answer: string,
  userQuestion: string,
  context: string,
  queryIntent?: QueryIntent,
): string {
  return `You are a quality evaluator for the USOPC Athlete Support Assistant. \
Your job is to determine whether the following answer adequately addresses the athlete's specific question using the retrieved context.

## User Question

${userQuestion}

## Query Intent

${queryIntent ?? "general"}

## Retrieved Context

${context}

## Answer to Evaluate

${answer}

## Evaluation Criteria

Rate the answer on a scale of 0.0 to 1.0 based on:

1. **Specificity**: Does the answer address the athlete's specific situation, citing concrete documents, sections, dates, and procedures? Or is it generic boilerplate that could apply to any question?

2. **Grounding**: Is every claim in the answer supported by the retrieved context? Flag any statements that appear to go beyond the provided documents.

3. **Completeness**: Does the answer cover the key aspects of the question? Are important details from the context missing?

## Issue Types

If you find problems, classify each as one of:
- \`generic_response\`: The answer is boilerplate and doesn't address the specific question with details from the context.
- \`hallucination_signal\`: The answer contains claims not supported by the retrieved context.
- \`incomplete\`: The answer misses key information available in the context.
- \`missing_specificity\`: The answer lacks specific document names, section numbers, dates, or procedures that are available in the context.

Each issue should have a severity: \`critical\`, \`major\`, or \`minor\`.

## Response Format

Respond with ONLY a JSON object (no markdown fences, no explanation):

{
  "passed": true/false,
  "score": 0.0-1.0,
  "issues": [
    {
      "type": "generic_response|hallucination_signal|incomplete|missing_specificity",
      "description": "Brief description of the issue",
      "severity": "critical|major|minor"
    }
  ],
  "critique": "A concise paragraph explaining what should be improved. If passed, leave empty string."
}`;
}
