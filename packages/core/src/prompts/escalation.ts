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
    contactUrl: "https://www.usopc.org/voice-and-representation",
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
  return ESCALATION_TARGETS.filter((target) =>
    target.domains.includes(domain),
  );
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

  const primary = targets[0];
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

export const ESCALATION_PROMPT = `You are the escalation assessor for the USOPC Athlete Support Assistant. \
Based on the classified query and user message, determine if the user should be directed \
to an external authority for immediate or specialized assistance.

## Escalation Criteria

### Immediate Escalation (urgency: "immediate")
- User describes active abuse, harassment, or misconduct --> U.S. Center for SafeSport
- User or someone else is in immediate physical danger --> 911, then SafeSport
- User has been notified of an anti-doping rule violation --> USADA
- User has a hearing or arbitration deadline within 7 days --> Athlete Ombuds

### Standard Escalation (urgency: "standard")
- User needs legal guidance on an active dispute --> Athlete Ombuds
- User wants to file a formal complaint or grievance --> Athlete Ombuds
- User has questions about a pending CAS appeal --> Athlete Ombuds + CAS
- User wants to report non-urgent misconduct --> U.S. Center for SafeSport
- User has governance or representation concerns --> Athletes' Commission

## Escalation Targets

{{escalationTargets}}

## User Message

{{userMessage}}

## Classification Result

{{classificationResult}}

## Instructions

Based on the above, determine:
1. Whether escalation is needed
2. Which target(s) to escalate to
3. The urgency level
4. A clear reason for the escalation

Return a JSON object:
{
  "shouldEscalate": boolean,
  "escalations": [
    {
      "targetId": string,
      "urgency": "immediate" | "standard",
      "reason": string
    }
  ]
}`;

/**
 * Fills the escalation prompt template with context.
 */
export function buildEscalationPrompt(
  userMessage: string,
  classificationResult: string,
): string {
  const targetsDescription = ESCALATION_TARGETS.map(
    (t) =>
      `- **${t.organization}** (${t.id}): ${t.description} ` +
      `[${t.contactPhone ?? ""} | ${t.contactEmail ?? ""} | ${t.contactUrl ?? ""}]`,
  ).join("\n");

  return ESCALATION_PROMPT.replace("{{escalationTargets}}", targetsDescription)
    .replace("{{userMessage}}", userMessage)
    .replace("{{classificationResult}}", classificationResult);
}
