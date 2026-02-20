import type { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logger, CircuitBreakerError } from "@usopc/shared";
import {
  getEscalationTargets,
  buildEscalation,
  withEmpathy,
  buildEscalationPrompt,
  SYSTEM_PROMPT,
  type EscalationTarget,
} from "../../prompts/index.js";
import {
  invokeAnthropic,
  extractTextFromResponse,
} from "../../services/anthropicService.js";
import { getLastUserMessage, stateContext } from "../../utils/index.js";
import type { AgentState } from "../state.js";
import type { TopicDomain, EscalationInfo } from "../../types/index.js";

const log = logger.child({ service: "escalate-node" });

/**
 * Determines urgency based on domain and state signals.
 */
function determineUrgency(
  state: AgentState,
  domain: TopicDomain,
): "immediate" | "standard" {
  // SafeSport and anti-doping are always immediate
  if (domain === "safesport" || domain === "anti_doping") {
    return "immediate";
  }

  // Time constraints escalate urgency
  if (state.hasTimeConstraint) {
    return "immediate";
  }

  return "standard";
}

/**
 * Formats an escalation target into a human-readable contact block
 * for the deterministic fallback message.
 */
function formatContactBlock(target: EscalationTarget): string {
  const lines: string[] = [];
  lines.push(`**${target.organization}**`);
  lines.push(target.description);

  if (target.contactPhone) {
    lines.push(`- Phone: ${target.contactPhone}`);
  }
  if (target.contactEmail) {
    lines.push(`- Email: ${target.contactEmail}`);
  }
  if (target.contactUrl) {
    lines.push(`- Website: ${target.contactUrl}`);
  }

  return lines.join("\n");
}

/**
 * Builds a deterministic fallback message when the LLM is unavailable.
 * Unlike the old template, this does NOT include a blanket 911 preamble.
 */
function buildFallbackMessage(targets: EscalationTarget[]): string {
  const parts: string[] = [];

  parts.push(
    "I recommend reaching out to the following resource(s) " +
      "for assistance with your situation.\n",
  );

  for (const target of targets) {
    parts.push(formatContactBlock(target));
    parts.push(""); // blank line between contacts
  }

  return parts.join("\n");
}

/**
 * Generates a context-aware escalation response using the LLM.
 * Falls back to a deterministic message if the LLM is unavailable.
 */
async function generateEscalationResponse(
  model: ChatAnthropic,
  userMessage: string,
  domain: TopicDomain,
  urgency: "immediate" | "standard",
  escalationReason: string | undefined,
  targets: EscalationTarget[],
): Promise<string> {
  const prompt = buildEscalationPrompt(
    userMessage,
    domain,
    urgency,
    escalationReason,
    targets,
  );

  try {
    const response = await invokeAnthropic(model, [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    return extractTextFromResponse(response);
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      log.warn("Escalation LLM circuit open; using fallback message", {
        domain,
      });
    } else {
      log.error("Escalation LLM call failed; using fallback message", {
        error: error instanceof Error ? error.message : String(error),
        domain,
      });
    }

    return buildFallbackMessage(targets);
  }
}

/**
 * ESCALATE node.
 *
 * Routes the user to the appropriate authority when the classifier
 * determines that escalation is needed. This node:
 *
 * 1. Identifies the relevant escalation targets for the topic domain
 * 2. Determines the urgency level
 * 3. Builds an EscalationInfo object with contact details (deterministic)
 * 4. Generates a context-aware referral message using the LLM
 *
 * The LLM tailors the response to the athlete's specific situation while
 * keeping contact information grounded in verified data. If the LLM is
 * unavailable, a deterministic fallback provides contact info without
 * the blanket 911 preamble.
 */
export function createEscalateNode(model: ChatAnthropic) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const userMessage = getLastUserMessage(state.messages);
    const domain = state.topicDomain ?? "dispute_resolution";
    const escalationReason = state.escalationReason;

    try {
      const targets = getEscalationTargets(domain);
      const urgency = determineUrgency(state, domain);

      if (targets.length === 0) {
        log.warn("No escalation targets found for domain", { domain });
        // Fall back to the Athlete Ombuds as a universal contact
        const fallbackEscalation: EscalationInfo = {
          target: "athlete_ombuds",
          organization: "Athlete Ombuds",
          contactEmail: "ombudsman@usathlete.org",
          contactPhone: "719-866-5000",
          contactUrl: "https://www.usathlete.org",
          reason:
            escalationReason ??
            "Query requires human assistance and no specific escalation target was identified",
          urgency: "standard",
        };

        return {
          answer: withEmpathy(
            "Your question is best addressed by speaking with the Athlete Ombuds, " +
              "who provides free, confidential, and independent advice to athletes.\n\n" +
              "**Athlete Ombuds**\n" +
              "- Phone: 719-866-5000\n" +
              "- Email: ombudsman@usathlete.org\n" +
              "- Website: https://www.usathlete.org",
            state.emotionalState,
          ),
          escalation: fallbackEscalation,
        };
      }

      // Build the escalation info deterministically for analytics/tracking
      const reason =
        escalationReason ??
        `User query requires ${urgency} escalation to ${targets[0]!.organization} ` +
          `for ${domain.replace(/_/g, " ")} matter`;

      const escalation = buildEscalation(domain, reason, urgency);

      // Generate context-aware response via LLM (with fallback)
      const answer = await generateEscalationResponse(
        model,
        userMessage,
        domain,
        urgency,
        escalationReason,
        targets,
      );

      log.info("Escalation complete", {
        domain,
        urgency,
        targetCount: targets.length,
        primaryTarget: targets[0]!.id,
        llmGenerated: true,
      });

      return {
        answer: withEmpathy(answer, state.emotionalState),
        escalation: escalation ?? undefined,
      };
    } catch (error) {
      log.error("Escalation failed", {
        error: error instanceof Error ? error.message : String(error),
        ...stateContext(state),
      });

      // Even on error, provide a basic referral
      return {
        answer: withEmpathy(
          "I encountered an issue processing your request. For immediate assistance, " +
            "please contact the Athlete Ombuds at ombudsman@usathlete.org or 719-866-5000. " +
            "They provide free, confidential advice to athletes.",
          state.emotionalState,
        ),
        escalation: {
          target: "athlete_ombuds",
          organization: "Athlete Ombuds",
          contactEmail: "ombudsman@usathlete.org",
          contactPhone: "719-866-5000",
          contactUrl: "https://www.usathlete.org",
          reason:
            escalationReason ??
            "Escalation processing error; providing default referral",
          urgency: "standard",
        },
      };
    }
  };
}
