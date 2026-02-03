import type { QueryIntent } from "../types/index.js";

/**
 * Base instructions that apply to all response formats.
 */
const BASE_INSTRUCTIONS = `## Instructions

1. **Synthesize an accurate answer** using ONLY the information present in the retrieved context above. Do not introduce facts, rules, procedures, or provisions that are not supported by the provided documents.

2. **Cite specific sections and provisions.** When referencing a rule, bylaw, policy, or procedure, include:
   - The document title
   - The specific section, article, or provision number
   - The effective date if available
   Example: "Under the USA Swimming Selection Procedures for the 2024 Olympic Games (Section 4.2, effective January 2024)..."

3. **Distinguish between organizations.** Be explicit about which NGB, organization, or governing body a rule belongs to. Do not conflate one NGB's rules with another's. If the context contains information from multiple NGBs, clearly attribute each piece of information.

4. **Flag potentially outdated information.** If a document's effective date is more than 12 months old, or if the context suggests the information may have been superseded, note this: "Note: This information is based on [Document Title] effective [Date]. Please verify this is still current."

5. **Acknowledge gaps.** If the retrieved context does not fully answer the question, explicitly state what is not covered: "The available documents do not address [specific aspect]. For this information, you may want to contact [relevant authority]."

6. **Never fabricate.** If the context is insufficient to answer the question, say so. Do not guess, speculate, or generate plausible-sounding but unsupported information.

7. **Use clear, accessible language.** Athletes may not have legal or governance expertise. Explain technical terms and acronyms on first use.`;

/**
 * Response format for factual queries (simple lookups).
 * Concise: 1-3 sentences, under 150 words.
 */
const FACTUAL_FORMAT = `## Response Format

This is a **factual** question seeking a specific piece of information. Keep your response concise and direct.

Structure your response as follows:
- **Answer**: 1-3 sentences directly answering the question
- **Source**: Document title and section

**Keep your response under 150 words.** Do not include unnecessary elaboration.`;

/**
 * Response format for procedural queries (how-to questions).
 * Overview + numbered steps, under 300 words.
 */
const PROCEDURAL_FORMAT = `## Response Format

This is a **procedural** question asking how to do something. Provide clear, actionable steps.

Structure your response as follows:
- **Overview**: Brief summary (1-2 sentences)
- **Steps**: Numbered list of actions the athlete should take
- **Source**: Document title and section

**Keep your response under 300 words.** Focus on the essential steps.`;

/**
 * Response format for deadline queries (time-sensitive questions).
 * Specific dates/timeframes, under 100 words.
 */
const DEADLINE_FORMAT = `## Response Format

This is a **deadline** question asking about timing or time constraints. Be precise about dates and timeframes.

Structure your response as follows:
- **Deadline**: The specific date or timeframe
- **Key Dates**: Any related dates (filing windows, notice periods)
- **Source**: Document title and section

**Keep your response under 100 words.** Lead with the most critical date.`;

/**
 * Response format for general or complex queries.
 * Full 5-section format for comprehensive answers.
 */
const GENERAL_FORMAT = `## Response Format

Structure your response as follows:
- **Direct Answer**: Lead with a concise answer to the question.
- **Details & Context**: Provide supporting details with citations.
- **Deadlines / Time Constraints**: If applicable, list relevant deadlines.
- **Next Steps**: Actionable steps the athlete can take.
- **Sources**: List the documents and sections cited.`;

/**
 * Maps query intent to the appropriate response format.
 */
function getResponseFormat(intent: QueryIntent | undefined): string {
  switch (intent) {
    case "factual":
      return FACTUAL_FORMAT;
    case "procedural":
      return PROCEDURAL_FORMAT;
    case "deadline":
      return DEADLINE_FORMAT;
    default:
      // "general", "escalation", or undefined all use the full format
      return GENERAL_FORMAT;
  }
}

/**
 * Legacy synthesizer prompt (full format).
 * @deprecated Use buildSynthesizerPrompt with queryIntent for adaptive responses.
 */
export const SYNTHESIZER_PROMPT = `You are the response synthesizer for the USOPC Athlete Support Assistant. \
Your job is to produce an accurate, well-cited answer based on the retrieved context documents provided below.

## Retrieved Context

{{context}}

## User Question

{{userQuestion}}

${BASE_INSTRUCTIONS}

${GENERAL_FORMAT}`;

/**
 * Fills the synthesizer prompt template with retrieved context, user question,
 * and optionally adapts the response format based on query intent.
 *
 * @param context - The retrieved documents formatted as text
 * @param userQuestion - The user's question
 * @param queryIntent - Optional intent to adapt response format (factual, procedural, deadline, general)
 */
export function buildSynthesizerPrompt(
  context: string,
  userQuestion: string,
  queryIntent?: QueryIntent,
): string {
  const responseFormat = getResponseFormat(queryIntent);

  const prompt = `You are the response synthesizer for the USOPC Athlete Support Assistant. \
Your job is to produce an accurate, well-cited answer based on the retrieved context documents provided below.

## Retrieved Context

${context}

## User Question

${userQuestion}

${BASE_INSTRUCTIONS}

${responseFormat}`;

  return prompt;
}
