import type { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logger, CircuitBreakerError } from "@usopc/shared";
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
  stateContext,
  buildContext,
} from "../../utils/index.js";
import type { AgentState } from "../state.js";

const log = logger.child({ service: "synthesizer-node" });

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
 *
 * When retrying after a quality check failure, appends the critique as
 * feedback to guide the model toward a more specific response.
 */
export function createSynthesizerNode(model: ChatAnthropic) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    // Build contextual query from conversation history
    const { currentMessage, conversationContext } = buildContextualQuery(
      state.messages,
      { conversationSummary: state.conversationSummary },
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
      log.warn(
        "Retrieval failed and no context available; skipping synthesis",
        {
          ...stateContext(state),
        },
      );
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
    let prompt = buildSynthesizerPrompt(
      context,
      currentMessage,
      state.queryIntent,
      conversationContext,
    );
    // Append emotional support guidance or generic tone guidance
    if (state.emotionalSupportContext) {
      const { guidance, toneModifiers } = state.emotionalSupportContext;
      prompt += `\n\nEMOTIONAL SUPPORT GUIDANCE: ${guidance}`;
      prompt += `\n\nTONE REQUIREMENTS:\n${toneModifiers.map((m) => `- ${m}`).join("\n")}`;
    } else {
      prompt += getEmotionalToneGuidance(state.emotionalState);
    }

    // On retry after quality check failure, append critique as feedback
    const isRetry =
      state.qualityCheckResult && !state.qualityCheckResult.passed;
    if (isRetry) {
      prompt += `\n\n## Quality Feedback\n\n<critique>\n${state.qualityCheckResult!.critique}\n</critique>\n\nRevise your response to address the issues described between the <critique> tags above.`;
    }

    try {
      log.info("Synthesizing answer", {
        documentCount: state.retrievedDocuments.length,
        webResultCount: state.webSearchResults.length,
        isRetry: !!isRetry,
        retryCount: state.qualityRetryCount,
        ...stateContext(state),
      });

      const response = await invokeAnthropic(model, [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(prompt),
      ]);

      const rawAnswer = extractTextFromResponse(response);

      let answer: string;
      if (state.emotionalSupportContext) {
        const { acknowledgment, safetyResources } =
          state.emotionalSupportContext;
        const resourceBlock =
          safetyResources.length > 0
            ? "\n\n**Support Resources:**\n" +
              safetyResources.map((r) => `- ${r}`).join("\n")
            : "";
        answer = acknowledgment + "\n\n" + rawAnswer + resourceBlock;
      } else {
        answer = withEmpathy(rawAnswer, state.emotionalState);
      }

      log.info("Synthesis complete", {
        answerLength: answer.length,
      });

      if (isRetry) {
        return { answer, qualityRetryCount: state.qualityRetryCount + 1 };
      }

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
  };
}
