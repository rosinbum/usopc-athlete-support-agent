import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logger } from "@usopc/shared";
import { MODEL_CONFIG } from "../../config/index.js";
import { SYSTEM_PROMPT, buildSynthesizerPrompt } from "../../prompts/index.js";
import { buildContextualQuery } from "../../utils/index.js";
import type { AgentState } from "../state.js";
import type { RetrievedDocument } from "../../types/index.js";

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
 * Extracts the text content from the last user message.
 */
function getLastUserMessage(state: AgentState): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (
      msg._getType() === "human" ||
      (msg as unknown as Record<string, unknown>).role === "user"
    ) {
      return typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    }
  }
  return "";
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

  const context = buildContext(state);
  // Pass queryIntent to adapt response format (concise for factual/deadline, detailed for general)
  // Pass conversation history for contextual responses
  const prompt = buildSynthesizerPrompt(
    context,
    currentMessage,
    state.queryIntent,
    conversationContext,
  );

  const model = new ChatAnthropic({
    model: MODEL_CONFIG.agent.model,
    temperature: MODEL_CONFIG.agent.temperature,
    maxTokens: MODEL_CONFIG.agent.maxTokens,
  });

  try {
    log.info("Synthesizing answer", {
      documentCount: state.retrievedDocuments.length,
      webResultCount: state.webSearchResults.length,
      topicDomain: state.topicDomain,
      queryIntent: state.queryIntent,
    });

    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    const answer =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .filter(
                (block): block is { type: "text"; text: string } =>
                  typeof block === "object" &&
                  block !== null &&
                  "type" in block &&
                  block.type === "text",
              )
              .map((block) => block.text)
              .join("")
          : "";

    log.info("Synthesis complete", {
      answerLength: answer.length,
    });

    return { answer };
  } catch (error) {
    log.error("Synthesis failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      answer:
        "I encountered an error while generating your answer. Please try again, " +
        "or contact the Athlete Ombuds at ombudsman@usathlete.org or 719-866-5000 " +
        "for direct assistance.",
    };
  }
}
