import type { ContactInfo } from "../types/domain.js";

export const CONTACT_DIRECTORY: ContactInfo[] = [
  {
    organization: "Athlete Ombuds",
    role: "Independent advisor for athlete disputes and rights",
    email: "ombudsman@usathlete.org",
    phone: "719-866-5000",
    url: "https://www.usathlete.org",
    description:
      "The Athlete Ombuds provides free, confidential, and independent advice to athletes " +
      "regarding their rights and responsibilities within the U.S. Olympic and Paralympic Movement. " +
      "The Ombuds can help athletes understand dispute resolution options (including Section 9 arbitration), " +
      "team selection procedures, eligibility issues, and governance concerns. " +
      "The Ombuds does not represent athletes but helps them navigate the system.",
  },
  {
    organization: "U.S. Center for SafeSport",
    role: "Abuse and misconduct reporting and investigation",
    phone: "833-5US-SAFE (833-587-7233)",
    url: "https://uscenterforsafesport.org/report-a-concern/",
    description:
      "The U.S. Center for SafeSport is the independent organization authorized by Congress " +
      "to investigate and resolve reports of sexual misconduct, emotional misconduct, " +
      "physical misconduct, bullying, hazing, and harassment in U.S. Olympic and Paralympic sport. " +
      "Reports can be made online or by phone and may be submitted anonymously. " +
      "The Center has exclusive jurisdiction over sexual misconduct allegations involving " +
      "participants in the Olympic and Paralympic Movement.",
  },
  {
    organization: "U.S. Anti-Doping Agency (USADA)",
    role: "Anti-doping testing, education, and adjudication",
    phone: "1-866-601-2632",
    url: "https://www.usada.org",
    description:
      "USADA is the independent anti-doping organization responsible for testing, education, " +
      "research, and adjudication for athletes in the U.S. Olympic and Paralympic Movement. " +
      "Contact USADA for questions about drug testing, Therapeutic Use Exemptions (TUEs), " +
      "whereabouts requirements, the prohibited substance list, supplement safety, " +
      "and anti-doping rule violations. USADA also provides educational resources and " +
      "the Global DRO (Drug Reference Online) to check medication status.",
  },
  {
    organization: "Team USA Athletes' Commission",
    role: "Athlete representation and governance voice",
    url: "https://www.usopc.org/voice-and-representation",
    description:
      "The Team USA Athletes' Commission represents athlete interests within the USOPC " +
      "governance structure. The Commission advocates for athlete welfare, rights, and " +
      "representation across all levels of Olympic and Paralympic governance. " +
      "Athletes can contact the Commission for questions about the Athlete Bill of Rights, " +
      "athlete representation on NGB and USOPC boards, governance reform, " +
      "and other representation matters.",
  },
  {
    organization: "Athlete Legal Aid Program",
    role: "Legal assistance referral for athletes",
    email: "ombudsman@usathlete.org",
    phone: "719-866-5000",
    url: "https://www.usathlete.org",
    description:
      "The Athlete Legal Aid Program is accessible through the Athlete Ombuds. " +
      "It provides referrals to legal counsel for athletes who need representation " +
      "in arbitration, disputes, or other legal matters related to their participation " +
      "in the U.S. Olympic and Paralympic Movement. Contact the Ombuds to learn about " +
      "available legal resources and whether you may qualify for assistance.",
  },
  {
    organization: "Court of Arbitration for Sport (CAS)",
    role: "International sports arbitration",
    url: "https://www.tas-cas.org",
    description:
      "The Court of Arbitration for Sport (CAS) is the international arbitration body " +
      "for sport-related disputes. CAS hears appeals from decisions made by sports " +
      "organizations, including appeals from Section 9 arbitration awards under U.S. law. " +
      "CAS has strict filing deadlines (typically 21 days from the decision being appealed). " +
      "Athletes considering a CAS appeal should seek legal counsel immediately due to " +
      "the complexity and cost of proceedings.",
  },
];

/**
 * Finds contact information for a given organization name (case-insensitive partial match).
 */
export function findContact(query: string): ContactInfo | undefined {
  const lowerQuery = query.toLowerCase();
  return CONTACT_DIRECTORY.find(
    (contact) =>
      contact.organization.toLowerCase().includes(lowerQuery) ||
      contact.role.toLowerCase().includes(lowerQuery),
  );
}

/**
 * Returns all contacts relevant to a given topic by searching descriptions and roles.
 */
export function findContactsByTopic(topic: string): ContactInfo[] {
  const lowerTopic = topic.toLowerCase();
  return CONTACT_DIRECTORY.filter(
    (contact) =>
      contact.description.toLowerCase().includes(lowerTopic) ||
      contact.role.toLowerCase().includes(lowerTopic) ||
      contact.organization.toLowerCase().includes(lowerTopic),
  );
}
