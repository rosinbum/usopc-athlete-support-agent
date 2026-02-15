import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logger, CircuitBreakerError } from "@usopc/shared";
import { getModelConfig } from "../../config/index.js";
import {
  SYSTEM_PROMPT,
  buildSynthesizerPrompt,
  withEmpathy,
  getEmotionalToneGuidance,
} from "../../prompts/index.js";
import {
  invokeAnthropic,
  extractTextFromResponse,
} from "../../services/anthropicService.js";
import {
  buildContextualQuery,
  getLastUserMessage,
  stateContext,
} from "../../utils/index.js";
import type { AgentState } from "../state.js";
import type { RetrievedDocument } from "../../types/index.js";
import type { AuthorityLevel } from "@usopc/shared";

/**
 * Maps authority level codes to human-readable labels.
 */
const AUTHORITY_LEVEL_LABELS: Record<AuthorityLevel, string> = {
  law: "Federal/State Law",
  international_rule: "International Rule",
  usopc_governance: "USOPC Governance",
  usopc_policy_procedure: "USOPC Policy",
  independent_office: "Independent Office (SafeSport, Ombuds)",
  anti_doping_national: "USADA Rules",
  ngb_policy_procedure: "NGB Policy",
  games_event_specific: "Games-Specific Rules",
  educational_guidance: "Educational Guidance",
};

const log = logger.child({ service: "synthesizer-node" });

/**
 * Formats a single retrieved document into a text block for the prompt context.
 */
function formatDocument(doc: RetrievedDocument, index: number): string {
  const parts: string[] = [];

  parts.push(`[Document ${index + 1}]`);

  if (doc.metadata.documentTitle) {
    parts.push(`Title: ${doc.metadata.documentTitle}`);
  }
  if (doc.metadata.sectionTitle) {
    parts.push(`Section: ${doc.metadata.sectionTitle}`);
  }
  if (doc.metadata.documentType) {
    parts.push(`Type: ${doc.metadata.documentType}`);
  }
  if (doc.metadata.ngbId) {
    parts.push(`Organization: ${doc.metadata.ngbId}`);
  }
  if (doc.metadata.effectiveDate) {
    parts.push(`Effective Date: ${doc.metadata.effectiveDate}`);
  }
  if (doc.metadata.authorityLevel) {
    const label =
      AUTHORITY_LEVEL_LABELS[doc.metadata.authorityLevel] ||
      doc.metadata.authorityLevel;
    parts.push(`Authority Level: ${label}`);
  }
  if (doc.metadata.sourceUrl) {
    parts.push(`Source: ${doc.metadata.sourceUrl}`);
  }
  parts.push(`Relevance Score: ${doc.score.toFixed(4)}`);
  parts.push("---");
  parts.push(doc.content);

  return parts.join("\n");
}

/**
 * Formats web search results into a text block for the prompt context.
 */
function formatWebResults(results: string[]): string {
  if (results.length === 0) return "";

  const parts: string[] = ["\n[Web Search Results]"];

  results.forEach((result, index) => {
    parts.push(`\n[Web Result ${index + 1}]`);
    parts.push(result);
  });

  return parts.join("\n");
}

/**
 * Builds the full context string from retrieved documents and web results.
 */
function buildContext(state: AgentState): string {
  const contextParts: string[] = [];

  // Format retrieved documents
  if (state.retrievedDocuments.length > 0) {
    const formattedDocs = state.retrievedDocuments.map((doc, i) =>
      formatDocument(doc, i),
    );
    contextParts.push(formattedDocs.join("\n\n"));
  }

  // Append web search results if available
  if (state.webSearchResults.length > 0) {
    contextParts.push(formatWebResults(state.webSearchResults));
  }

  if (contextParts.length === 0) {
    return "No documents or search results were found for this query.";
  }

  return contextParts.join("\n\n");
}

/**
 * SYNTHESIZER node.
 *
 * Takes retrieved documents and/or web search results and generates a
 * comprehensive, well-cited answer using Claude Sonnet.
 *
 * The node:
 * 1. Formats all available context (documents + web results)
 * 2. Builds the synthesizer prompt with the context and user question
 * 3. Calls Claude Sonnet with the system prompt and synthesizer prompt
 * 4. Returns the generated answer on state
 */
export async function synthesizerNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  // Build contextual query from conversation history
  const { currentMessage, conversationContext } = buildContextualQuery(
    state.messages,
  );

  if (!currentMessage) {
    log.warn("Synthesizer received empty user question");
    return {
      answer:
        "I wasn't able to understand your question. Could you please rephrase it?",
    };
  }

  // If the retriever reported an error and there are no documents or web
  // results to work with, return a user-friendly error instead of
  // synthesizing from empty context.
  if (
    state.retrievalStatus === "error" &&
    state.retrievedDocuments.length === 0 &&
    state.webSearchResults.length === 0
  ) {
    log.warn("Retrieval failed and no context available; skipping synthesis", {
      ...stateContext(state),
    });
    return {
      answer:
        "I was unable to search our knowledge base for your question. Please try again, " +
        "or contact the Athlete Ombuds at ombudsman@usathlete.org or 719-866-5000 " +
        "for direct assistance.",
    };
  }

  const context = buildContext(state);
  // Pass queryIntent to adapt response format (concise for factual/deadline, detailed for general)
  // Pass conversation history for contextual responses
  const basePrompt = buildSynthesizerPrompt(
    context,
    currentMessage,
    state.queryIntent,
    conversationContext,
  );
  // Append emotional tone guidance when the user is in a non-neutral state
  const prompt = basePrompt + getEmotionalToneGuidance(state.emotionalState);

  const config = await getModelConfig();
  const model = new ChatAnthropic({
    model: config.agent.model,
    temperature: config.agent.temperature,
    maxTokens: config.agent.maxTokens,
  });

  try {
    log.info("Synthesizing answer", {
      documentCount: state.retrievedDocuments.length,
      webResultCount: state.webSearchResults.length,
      ...stateContext(state),
    });

    const response = await invokeAnthropic(model, [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    const rawAnswer = extractTextFromResponse(response);
    const answer = withEmpathy(rawAnswer, state.emotionalState);

    log.info("Synthesis complete", {
      answerLength: answer.length,
    });

    return { answer };
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      log.warn("Synthesizer circuit open; returning rate-limit message", {
        ...stateContext(state),
      });
      return {
        answer:
          "I'm temporarily unable to generate a response due to high demand. " +
          "Please try again in a moment, or contact the Athlete Ombuds at " +
          "ombudsman@usathlete.org or 719-866-5000 for direct assistance.",
      };
    }

    log.error("Synthesis failed", {
      error: error instanceof Error ? error.message : String(error),
      ...stateContext(state),
    });

    return {
      answer:
        "I encountered an error while generating your answer. Please try again, " +
        "or contact the Athlete Ombuds at ombudsman@usathlete.org or 719-866-5000 " +
        "for direct assistance.",
    };
  }
}
