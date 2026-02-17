import type { TopicDomain } from "../types/agent.js";

export interface DisclaimerTemplate {
  domain: TopicDomain | "general";
  text: string;
}

const GENERAL_DISCLAIMER =
  "This information is for educational purposes only and does not constitute legal advice. " +
  "For personalized guidance, consult the Athlete Ombuds or qualified legal counsel.";

const DISPUTE_RESOLUTION_DISCLAIMER =
  GENERAL_DISCLAIMER +
  "\n\nFor assistance with disputes, including Section 9 arbitration and grievance procedures, " +
  "contact the Athlete Ombuds at ombudsman@usathlete.org or 719-866-5000. " +
  "The Ombuds provides free, confidential, and independent advice to athletes.";

const SAFESPORT_DISCLAIMER =
  "If you are in immediate danger, call 911. " +
  "To report abuse or misconduct in sport, contact the U.S. Center for SafeSport " +
  "at https://uscenterforsafesport.org/report-a-concern/ or call 833-5US-SAFE (833-587-7233). " +
  "Reports can be made anonymously.\n\n" +
  GENERAL_DISCLAIMER;

const ANTI_DOPING_DISCLAIMER =
  GENERAL_DISCLAIMER +
  "\n\nFor anti-doping questions, including Therapeutic Use Exemptions (TUEs), " +
  "whereabouts requirements, or testing procedures, contact USADA at " +
  "https://www.usada.org or call 1-866-601-2632. " +
  "If you have been notified of a potential anti-doping rule violation, " +
  "seek legal counsel immediately.";

const GOVERNANCE_DISCLAIMER =
  GENERAL_DISCLAIMER +
  "\n\nFor governance and representation concerns, contact the " +
  "Team USA Athletes' Commission at https://www.usopc.org/voice-and-representation " +
  "or reach out to your NGB's athlete representative. " +
  "The Athletes' Advisory Council can also be contacted through the USOPC.";

const ATHLETE_RIGHTS_DISCLAIMER =
  GENERAL_DISCLAIMER +
  "\n\nFor questions about athlete rights, representation, and the Athlete Bill of Rights, " +
  "contact the Team USA Athletes' Commission at https://www.usopc.org/voice-and-representation. " +
  "For marketing and sponsorship rights questions, the Athlete Ombuds can provide guidance " +
  "at ombudsman@usathlete.org or 719-866-5000.";

const TEAM_SELECTION_DISCLAIMER =
  GENERAL_DISCLAIMER +
  "\n\nTeam selection procedures vary by sport and event. Always refer to the specific " +
  "NGB's published selection procedures for the competition in question. " +
  "If you believe a selection decision was made in error, contact the Athlete Ombuds " +
  "at ombudsman@usathlete.org or 719-866-5000 for guidance on your options.";

const ELIGIBILITY_DISCLAIMER =
  GENERAL_DISCLAIMER +
  "\n\nEligibility requirements vary by sport, competition level, and governing body. " +
  "Contact your NGB directly or the Athlete Ombuds at ombudsman@usathlete.org " +
  "for guidance specific to your situation.";

const DISCLAIMER_MAP: Record<TopicDomain | "general", string> = {
  general: GENERAL_DISCLAIMER,
  team_selection: TEAM_SELECTION_DISCLAIMER,
  dispute_resolution: DISPUTE_RESOLUTION_DISCLAIMER,
  safesport: SAFESPORT_DISCLAIMER,
  anti_doping: ANTI_DOPING_DISCLAIMER,
  eligibility: ELIGIBILITY_DISCLAIMER,
  governance: GOVERNANCE_DISCLAIMER,
  athlete_rights: ATHLETE_RIGHTS_DISCLAIMER,
  athlete_safety: GENERAL_DISCLAIMER,
  financial_assistance: GENERAL_DISCLAIMER,
};

/**
 * Returns the appropriate disclaimer text for a given topic domain.
 * Falls back to the general disclaimer if no domain is provided.
 */
export function getDisclaimer(domain?: TopicDomain): string {
  if (domain && domain in DISCLAIMER_MAP) {
    return DISCLAIMER_MAP[domain];
  }
  return DISCLAIMER_MAP.general;
}

/**
 * Returns all disclaimer templates as an array for inspection or testing.
 */
export function getAllDisclaimers(): DisclaimerTemplate[] {
  return Object.entries(DISCLAIMER_MAP).map(([domain, text]) => ({
    domain: domain as TopicDomain | "general",
    text,
  }));
}
