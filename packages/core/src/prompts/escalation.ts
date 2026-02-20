import type { TopicDomain, EscalationInfo } from "../types/agent.js";

export interface EscalationTarget {
  id: string;
  organization: string;
  contactEmail?: string;
  contactPhone?: string;
  contactUrl?: string;
  domains: TopicDomain[];
  urgencyDefault: "immediate" | "standard";
  description: string;
}

/**
 * Directory of escalation targets mapped to the domains they serve.
 */
export const ESCALATION_TARGETS: EscalationTarget[] = [
  {
    id: "athlete_ombuds",
    organization: "Athlete Ombuds",
    contactEmail: "ombudsman@usathlete.org",
    contactPhone: "719-866-5000",
    contactUrl: "https://www.usathlete.org",
    domains: [
      "dispute_resolution",
      "team_selection",
      "eligibility",
      "governance",
      "athlete_rights",
    ],
    urgencyDefault: "standard",
    description:
      "Provides free, confidential, and independent advice to athletes on disputes, " +
      "team selection concerns, eligibility questions, and athlete rights. " +
      "The Ombuds can explain your options and help you navigate resolution processes.",
  },
  {
    id: "safesport_center",
    organization: "U.S. Center for SafeSport",
    contactPhone: "833-5US-SAFE (833-587-7233)",
    contactUrl: "https://uscenterforsafesport.org/report-a-concern/",
    domains: ["safesport"],
    urgencyDefault: "immediate",
    description:
      "The exclusive authority for investigating and resolving reports of sexual misconduct, " +
      "emotional misconduct, physical misconduct, bullying, hazing, and harassment in U.S. Olympic " +
      "and Paralympic sport. Reports can be made anonymously.",
  },
  {
    id: "usada",
    organization: "U.S. Anti-Doping Agency (USADA)",
    contactPhone: "1-866-601-2632",
    contactUrl: "https://www.usada.org",
    domains: ["anti_doping"],
    urgencyDefault: "immediate",
    description:
      "The independent anti-doping organization responsible for testing, education, research, " +
      "and adjudication for athletes in the U.S. Olympic and Paralympic Movement. " +
      "Contact USADA for questions about testing, TUEs, whereabouts, and anti-doping rule violations.",
  },
  {
    id: "athletes_commission",
    organization: "Team USA Athletes' Commission",
    contactEmail: "teamusa.ac@teamusa-ac.org",
    contactUrl: "https://www.usopc.org/teamusa-athletes-commission",
    domains: ["governance", "athlete_rights"],
    urgencyDefault: "standard",
    description:
      "Represents athlete interests within the USOPC governance structure. " +
      "Contact for questions about athlete representation on boards and committees, " +
      "the Athlete Bill of Rights, and governance reform.",
  },
  {
    id: "cas",
    organization: "Court of Arbitration for Sport (CAS)",
    contactUrl: "https://www.tas-cas.org",
    domains: ["dispute_resolution"],
    urgencyDefault: "standard",
    description:
      "International arbitration body for sport-related disputes. " +
      "CAS hears appeals from decisions by sports organizations, including Section 9 arbitration awards. " +
      "Strict filing deadlines apply (typically 21 days from the decision being appealed).",
  },
  {
    id: "emergency_services",
    organization: "Emergency Services",
    contactPhone: "911",
    domains: ["safesport"],
    urgencyDefault: "immediate",
    description:
      "If you or someone else is in immediate physical danger, call 911 first. " +
      "After ensuring safety, follow up with a report to the U.S. Center for SafeSport.",
  },
];

/**
 * Returns the escalation targets appropriate for a given topic domain.
 */
export function getEscalationTargets(domain: TopicDomain): EscalationTarget[] {
  return ESCALATION_TARGETS.filter((target) => target.domains.includes(domain));
}

/**
 * Builds an EscalationInfo object for a given domain and reason.
 * Picks the primary (first-matched) escalation target for the domain.
 */
export function buildEscalation(
  domain: TopicDomain,
  reason: string,
  urgency?: "immediate" | "standard",
): EscalationInfo | undefined {
  const targets = getEscalationTargets(domain);
  if (targets.length === 0) return undefined;

  const primary = targets[0]!;
  return {
    target: primary.id,
    organization: primary.organization,
    contactEmail: primary.contactEmail,
    contactPhone: primary.contactPhone,
    contactUrl: primary.contactUrl,
    reason,
    urgency: urgency ?? primary.urgencyDefault,
  };
}

export const ESCALATION_PROMPT = `You are the USOPC Athlete Support Assistant responding to an athlete \
who needs to be connected with the appropriate authority for their situation.

## Your Task

Write a supportive, context-aware response that:
1. Briefly acknowledges the athlete's specific situation (do NOT repeat their message back verbatim)
2. Explains why you are directing them to the recommended contact(s)
3. Provides the verified contact information below
4. Offers brief, situation-specific guidance on what to expect or how to prepare

## Critical Rules

- **911 guidance**: ONLY mention calling 911 if the escalation reason indicates IMMINENT PHYSICAL DANGER \
(e.g., active physical abuse happening now, someone in immediate danger of harm). \
Do NOT mention 911 for retaliation reports, emotional misconduct, policy violations, banned persons sightings, \
or any situation that is not an immediate physical safety emergency.
- **Contact information**: Use ONLY the verified contact details provided below. Do not fabricate phone numbers, \
emails, or URLs.
- **Cross-domain awareness**: If the athlete's situation spans multiple domains (e.g., a SafeSport issue that \
also involves a team selection dispute), address both aspects and provide contacts for each.
- **Tone**: Be empathetic but direct. The athlete is in a difficult situation and needs clear action steps.
- **Do NOT** attempt to investigate, adjudicate, or resolve the matter. You are connecting them to the right people.
- **Do NOT** use generic boilerplate. Tailor your response to what the athlete actually described.

## Verified Contact Information

{{contactBlocks}}

## Domain Context

{{domainGuidance}}

## Escalation Reason

{{escalationReason}}

## Athlete's Message

{{userMessage}}`;

/**
 * Formats a single escalation target into a contact block for the prompt.
 */
function formatTargetForPrompt(target: EscalationTarget): string {
  const lines: string[] = [];
  lines.push(`### ${target.organization}`);
  lines.push(target.description);
  if (target.contactPhone) lines.push(`- Phone: ${target.contactPhone}`);
  if (target.contactEmail)
    lines.push(
      `- Email: [${target.contactEmail}](mailto:${target.contactEmail})`,
    );
  if (target.contactUrl)
    lines.push(`- Website: [${target.organization}](${target.contactUrl})`);
  return lines.join("\n");
}

/**
 * Domain-specific guidance for the LLM to incorporate into responses.
 */
const DOMAIN_GUIDANCE: Record<TopicDomain, string> = {
  safesport:
    "This is a SafeSport matter. The U.S. Center for SafeSport has exclusive jurisdiction over " +
    "misconduct investigations in U.S. Olympic and Paralympic sport. Reports can be made anonymously. " +
    "If the athlete mentions retaliation, note that the SafeSport Code prohibits retaliation.",
  anti_doping:
    "This is an anti-doping matter. USADA handles all testing, adjudication, and TUE decisions " +
    "for U.S. Olympic and Paralympic athletes. Time-sensitive action may be required.",
  dispute_resolution:
    "This involves a dispute that may require formal resolution. The Athlete Ombuds provides " +
    "free, confidential guidance. Section 9 arbitration and AAA proceedings have strict deadlines.",
  team_selection:
    "This involves a team selection concern. The Athlete Ombuds can explain the athlete's options, " +
    "including whether a Section 9 arbitration claim is available.",
  eligibility:
    "This involves an eligibility question that requires expert guidance. " +
    "The Athlete Ombuds can advise on eligibility requirements and processes.",
  governance:
    "This involves a governance or compliance concern. The Athletes' Commission and " +
    "Athlete Ombuds can help with NGB compliance and athlete representation issues.",
  athlete_rights:
    "This involves athlete rights or representation. The Athletes' Commission handles " +
    "representation on boards/committees, and the Athlete Ombuds can advise on rights-related disputes.",
  athlete_safety:
    "This involves an athlete safety concern. The U.S. Center for SafeSport handles misconduct " +
    "reports, and the Athlete Ombuds can advise on safety-related issues and protections.",
  financial_assistance:
    "This involves athlete financial support or benefits. The Athlete Ombuds can advise on " +
    "available funding programs, stipends, and grant eligibility.",
};

/**
 * Builds the escalation prompt with full context for LLM generation.
 *
 * @param userMessage - The athlete's original message
 * @param domain - The classified topic domain
 * @param urgency - The determined urgency level
 * @param escalationReason - Why escalation was triggered (from classifier)
 * @param targets - Verified escalation targets for this domain
 */
export function buildEscalationPrompt(
  userMessage: string,
  domain: TopicDomain,
  urgency: "immediate" | "standard",
  escalationReason: string | undefined,
  targets: EscalationTarget[],
): string {
  const contactBlocks = targets.map(formatTargetForPrompt).join("\n\n");

  const domainGuidance = DOMAIN_GUIDANCE[domain] ?? "";

  const reason =
    escalationReason ??
    `User query requires ${urgency} escalation for ${domain.replace(/_/g, " ")} matter`;

  return ESCALATION_PROMPT.replace("{{contactBlocks}}", contactBlocks)
    .replace("{{domainGuidance}}", domainGuidance)
    .replace("{{escalationReason}}", reason)
    .replace("{{userMessage}}", userMessage);
}
