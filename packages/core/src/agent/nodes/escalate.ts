import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logger } from "@usopc/shared";
import { MODEL_CONFIG } from "../../config/index.js";
import {
  SYSTEM_PROMPT,
  getEscalationTargets,
  buildEscalation,
  type EscalationTarget,
} from "../../prompts/index.js";
import type { AgentState } from "../state.js";
import type { TopicDomain, EscalationInfo } from "../../types/index.js";

const log = logger.child({ service: "escalate-node" });

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
 * Formats an escalation target into a human-readable contact block.
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
 * Builds a referral answer message based on the escalation targets.
 */
function buildReferralMessage(
  targets: EscalationTarget[],
  domain: TopicDomain,
  urgency: "immediate" | "standard",
  userMessage: string,
): string {
  const parts: string[] = [];

  if (urgency === "immediate") {
    // Safety-critical preamble for immediate escalation
    if (domain === "safesport") {
      parts.push(
        "**If you are in immediate danger, please call 911 first.**\n",
      );
      parts.push(
        "Your concern involves potential abuse or misconduct, which requires " +
          "reporting to the appropriate authority. I am not equipped to investigate " +
          "or resolve SafeSport matters, but I can direct you to the right resources.\n",
      );
    } else if (domain === "anti_doping") {
      parts.push(
        "Your question involves an anti-doping matter that may require immediate " +
          "action. It is important that you contact USADA directly for guidance " +
          "specific to your situation.\n",
      );
    } else {
      parts.push(
        "Based on the urgency of your situation, I recommend contacting the " +
          "following resource(s) directly for timely assistance.\n",
      );
    }
  } else {
    parts.push(
      "Your question is best addressed by a specialized authority. " +
        "I recommend reaching out to the following resource(s) for personalized guidance.\n",
    );
  }

  // Contact blocks for each relevant target
  parts.push("## Recommended Contact(s)\n");
  for (const target of targets) {
    parts.push(formatContactBlock(target));
    parts.push(""); // blank line between contacts
  }

  // Add a brief note about what these contacts can help with
  parts.push("## What They Can Help With\n");
  const domainHelp: Record<TopicDomain, string> = {
    safesport:
      "The U.S. Center for SafeSport can investigate reports of sexual, emotional, " +
      "or physical misconduct, bullying, hazing, and harassment. Reports can be " +
      "made anonymously.",
    anti_doping:
      "USADA can assist with questions about drug testing, Therapeutic Use Exemptions " +
      "(TUEs), whereabouts requirements, prohibited substances, and anti-doping " +
      "rule violation proceedings.",
    dispute_resolution:
      "The Athlete Ombuds provides free, confidential advice on disputes including " +
      "Section 9 arbitration, grievance procedures, and how to challenge decisions " +
      "by an NGB or the USOPC.",
    team_selection:
      "The Athlete Ombuds can help you understand the selection procedures for your " +
      "sport and your options if you believe a selection decision was made in error.",
    eligibility:
      "The Athlete Ombuds can advise on eligibility requirements and processes for " +
      "your specific sport and competition level.",
    governance:
      "The Athletes' Commission and Athlete Ombuds can assist with governance concerns, " +
      "NGB compliance issues, and athlete representation questions.",
    athlete_rights:
      "The Athletes' Commission can help with questions about athlete representation, " +
      "the Athlete Bill of Rights, and marketing/sponsorship rights. The Athlete " +
      "Ombuds can provide confidential guidance on rights-related disputes.",
  };

  if (domain && domainHelp[domain]) {
    parts.push(domainHelp[domain]);
  }

  return parts.join("\n");
}

/**
 * ESCALATE node.
 *
 * Routes the user to the appropriate authority when the classifier
 * determines that escalation is needed. This node:
 *
 * 1. Identifies the relevant escalation targets for the topic domain
 * 2. Determines the urgency level
 * 3. Builds an EscalationInfo object with contact details
 * 4. Generates a helpful referral message directing the user to the
 *    correct authority
 *
 * The answer is a referral message (not a substantive answer to the
 * user's question) because the query requires human assistance.
 */
export async function escalateNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const userMessage = getLastUserMessage(state);
  const domain = state.topicDomain ?? "dispute_resolution";

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
        reason: "Query requires human assistance and no specific escalation target was identified",
        urgency: "standard",
      };

      return {
        answer:
          "Your question is best addressed by speaking with the Athlete Ombuds, " +
          "who provides free, confidential, and independent advice to athletes.\n\n" +
          "**Athlete Ombuds**\n" +
          "- Phone: 719-866-5000\n" +
          "- Email: ombudsman@usathlete.org\n" +
          "- Website: https://www.usathlete.org",
        escalation: fallbackEscalation,
      };
    }

    // Build the escalation info from the primary target
    const escalation = buildEscalation(
      domain,
      `User query requires ${urgency} escalation to ${targets[0].organization} ` +
        `for ${domain.replace(/_/g, " ")} matter`,
      urgency,
    );

    // Generate the referral message
    const answer = buildReferralMessage(targets, domain, urgency, userMessage);

    log.info("Escalation complete", {
      domain,
      urgency,
      targetCount: targets.length,
      primaryTarget: targets[0].id,
    });

    return {
      answer,
      escalation: escalation ?? undefined,
    };
  } catch (error) {
    log.error("Escalation failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Even on error, provide a basic referral
    return {
      answer:
        "I encountered an issue processing your request. For immediate assistance, " +
        "please contact the Athlete Ombuds at ombudsman@usathlete.org or 719-866-5000. " +
        "They provide free, confidential advice to athletes.",
      escalation: {
        target: "athlete_ombuds",
        organization: "Athlete Ombuds",
        contactEmail: "ombudsman@usathlete.org",
        contactPhone: "719-866-5000",
        contactUrl: "https://www.usathlete.org",
        reason: "Escalation processing error; providing default referral",
        urgency: "standard",
      },
    };
  }
}
