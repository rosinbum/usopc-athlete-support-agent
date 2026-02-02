import type { DeadlineRule } from "../types/domain.js";

export const DEADLINE_RULES: DeadlineRule[] = [
  {
    id: "section_9_arbitration",
    name: "Section 9 Arbitration Filing Deadline",
    domain: "dispute_resolution",
    durationDays: 180,
    description:
      "Under the Ted Stevens Olympic and Amateur Sports Act, an athlete may file a " +
      "Section 9 complaint with the USOPC within 180 days of the final decision by the NGB. " +
      "This is the primary mechanism for athletes to challenge decisions by NGBs that deny " +
      "or threaten to deny them the opportunity to compete. The USOPC will refer the matter " +
      "to the American Arbitration Association (AAA) for expedited arbitration.",
    sourceReference:
      "36 U.S.C. Section 220529 (Ted Stevens Olympic and Amateur Sports Act, Section 9)",
  },
  {
    id: "safesport_reporting",
    name: "SafeSport Reporting -- No Statute of Limitations",
    domain: "safesport",
    durationDays: -1, // -1 indicates no limitation
    description:
      "There is no statute of limitations for reporting abuse or misconduct to the " +
      "U.S. Center for SafeSport. Reports of sexual misconduct, emotional misconduct, " +
      "physical misconduct, bullying, hazing, and harassment may be filed at any time, " +
      "regardless of when the conduct occurred. Reports can be made anonymously.",
    sourceReference:
      "SafeSport Code for the U.S. Olympic and Paralympic Movement; " +
      "Protecting Young Victims from Sexual Abuse and Safe Sport Authorization Act of 2017",
  },
  {
    id: "usada_whereabouts",
    name: "USADA Whereabouts Filing",
    domain: "anti_doping",
    durationDays: 90, // quarterly
    description:
      "Athletes in the USADA Registered Testing Pool (RTP) must file whereabouts " +
      "information on a quarterly basis through the ADAMS system. Whereabouts filings " +
      "are due by the 15th of the month preceding each quarter (e.g., December 15 for Q1). " +
      "Athletes must provide a 60-minute daily testing window and overnight address. " +
      "Three filing failures or missed tests within a 12-month period may result in " +
      "an anti-doping rule violation.",
    sourceReference:
      "USADA Protocol for Olympic and Paralympic Movement Testing; " +
      "World Anti-Doping Code, International Standard for Testing and Investigations (ISTI), Article 4",
  },
  {
    id: "cas_appeal",
    name: "CAS Appeal Filing Deadline",
    domain: "dispute_resolution",
    durationDays: 21,
    description:
      "Appeals to the Court of Arbitration for Sport (CAS) from AAA Section 9 " +
      "arbitration decisions must generally be filed within 21 days of receipt of " +
      "the written arbitration award. This deadline is strictly enforced. " +
      "Athletes considering a CAS appeal should engage legal counsel immediately " +
      "upon receiving an adverse arbitration decision.",
    sourceReference:
      "CAS Code of Sports-related Arbitration, Article R49; " +
      "36 U.S.C. Section 220529(d)",
  },
  {
    id: "team_selection_protest",
    name: "Team Selection Protest Window",
    domain: "team_selection",
    durationDays: 3, // representative; varies by NGB (typically 24-72 hours)
    description:
      "The deadline to protest a team selection decision varies by NGB and competition. " +
      "Most NGBs require protests to be filed within 24 to 72 hours of the selection " +
      "announcement or selection event. Athletes should consult the specific NGB's " +
      "published selection procedures for the exact protest timeline. Some NGBs require " +
      "protests to be filed on-site at the selection event. " +
      "Note: This is a general guideline; always check the specific NGB's selection procedures.",
    sourceReference:
      "Varies by NGB; see individual NGB Selection Procedures " +
      "(e.g., USA Swimming Selection Procedures, USA Track & Field Selection Procedures)",
  },
  {
    id: "ngb_internal_grievance",
    name: "NGB Internal Grievance Deadline",
    domain: "dispute_resolution",
    durationDays: 30,
    description:
      "Many NGBs require athletes to exhaust internal grievance procedures before " +
      "pursuing Section 9 arbitration. Internal grievance deadlines vary by NGB but " +
      "are typically 30 days from the decision or action being challenged. " +
      "Note: Exhaustion of internal remedies is not always required for Section 9 filing, " +
      "particularly if the internal process would be futile or would cause undue delay.",
    sourceReference:
      "Varies by NGB bylaws; 36 U.S.C. Section 220529(a) " +
      "(exhaustion not strictly required for Section 9)",
  },
  {
    id: "tue_advance_application",
    name: "TUE Advance Application",
    domain: "anti_doping",
    durationDays: 30,
    description:
      "Athletes who need a Therapeutic Use Exemption (TUE) should apply at least " +
      "30 days before a competition when possible. Retroactive TUEs may be granted " +
      "in limited circumstances (e.g., emergency medical treatment). International-level " +
      "athletes must apply through their International Federation; national-level athletes " +
      "apply through USADA.",
    sourceReference:
      "World Anti-Doping Code, International Standard for Therapeutic Use Exemptions (ISTUE), Article 6; " +
      "USADA Protocol for Olympic and Paralympic Movement Testing",
  },
];

/**
 * Returns all deadline rules for a given topic domain.
 */
export function getDeadlinesByDomain(domain: string): DeadlineRule[] {
  return DEADLINE_RULES.filter((rule) => rule.domain === domain);
}

/**
 * Finds a specific deadline rule by its ID.
 */
export function getDeadlineById(id: string): DeadlineRule | undefined {
  return DEADLINE_RULES.find((rule) => rule.id === id);
}
