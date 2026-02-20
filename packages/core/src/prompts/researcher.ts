/**
 * Builds the prompt for the researcher node's LLM-based query generation.
 *
 * Instructs Haiku to analyze conversation context for current event references
 * and generate 1-3 targeted web search queries. When the conversation mentions
 * specific organizations, concrete actions, or timeframes, the model produces
 * event-specific queries alongside policy queries.
 */
export function buildResearcherPrompt(
  currentMessage: string,
  conversationContext: string,
  topicDomain: string | undefined,
): string {
  const currentYear = new Date().getFullYear();

  const domainContext = topicDomain
    ? `The query domain is "${topicDomain}" in the context of U.S. Olympic and Paralympic governance.`
    : "The query is about U.S. Olympic and Paralympic governance.";

  return `You are a web search query generator for a USOPC (United States Olympic & Paralympic Committee) support agent.

Analyze the conversation and generate 1-3 targeted web search queries.

## Current User Message

${currentMessage}

## Conversation History

${conversationContext}

## Context

${domainContext}
The current year is ${currentYear}.

## Instructions

Generate web search queries as a JSON array of strings.

1. **First query**: Answer the user's current question with relevant policy/governance terms.
2. **Additional queries** (if the conversation references specific current events): Generate event-specific queries that include named organizations, concrete actions, and approximate timeframes (e.g., "${currentYear}").

Current event indicators: named NGBs/organizations taking specific actions (removing board members, changing policies, filing grievances), references to recent news, or time-sensitive situations.

- If no current events are detected, return exactly 1 query.
- If current events are detected, return 2-3 queries.
- Each query should be concise (under 15 words) and search-engine friendly.

Respond with ONLY a JSON array of strings. No explanation, no markdown fences.

["query 1"]`;
}
