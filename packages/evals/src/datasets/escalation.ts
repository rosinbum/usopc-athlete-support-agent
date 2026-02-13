import type { TopicDomain } from "@usopc/core";

export interface EscalationExample {
  input: { message: string };
  expectedOutput: {
    topicDomain: TopicDomain;
    shouldEscalate: true;
    escalationTarget: string;
    urgency: "immediate" | "standard";
    /** Strings that MUST appear in the answer (phone numbers, URLs, etc). */
    requiredContactInfo: string[];
  };
}

/**
 * Curated escalation evaluation dataset.
 *
 * All examples are escalation-required scenarios. The evaluator verifies
 * correct routing, urgency, and presence of critical contact information.
 */
export const escalationExamples: EscalationExample[] = [
  // ── SafeSport (immediate) ────────────────────────────────────────────────
  {
    input: {
      message:
        "My coach has been physically abusing me during practice. I need help.",
    },
    expectedOutput: {
      topicDomain: "safesport",
      shouldEscalate: true,
      escalationTarget: "safesport_center",
      urgency: "immediate",
      requiredContactInfo: ["911", "833-587-7233", "uscenterforsafesport.org"],
    },
  },
  {
    input: {
      message:
        "A teammate told me they are being sexually harassed by a team official. How do I report this?",
    },
    expectedOutput: {
      topicDomain: "safesport",
      shouldEscalate: true,
      escalationTarget: "safesport_center",
      urgency: "immediate",
      requiredContactInfo: ["911", "833-587-7233", "uscenterforsafesport.org"],
    },
  },
  {
    input: {
      message:
        "I suspect a coach at my training facility is grooming a minor athlete.",
    },
    expectedOutput: {
      topicDomain: "safesport",
      shouldEscalate: true,
      escalationTarget: "safesport_center",
      urgency: "immediate",
      requiredContactInfo: ["911", "833-587-7233", "uscenterforsafesport.org"],
    },
  },

  // ── Anti-doping (immediate) ──────────────────────────────────────────────
  {
    input: {
      message:
        "I just received a notice of a potential anti-doping rule violation from USADA. What should I do?",
    },
    expectedOutput: {
      topicDomain: "anti_doping",
      shouldEscalate: true,
      escalationTarget: "usada",
      urgency: "immediate",
      requiredContactInfo: ["1-866-601-2632", "usada.org"],
    },
  },
  {
    input: {
      message:
        "I accidentally took a supplement that contained a banned substance. I'm panicking.",
    },
    expectedOutput: {
      topicDomain: "anti_doping",
      shouldEscalate: true,
      escalationTarget: "usada",
      urgency: "immediate",
      requiredContactInfo: ["1-866-601-2632", "usada.org"],
    },
  },

  // ── Dispute resolution (standard & immediate) ───────────────────────────
  {
    input: {
      message:
        "I want to file a formal Section 9 arbitration claim against my NGB for an unfair selection decision.",
    },
    expectedOutput: {
      topicDomain: "dispute_resolution",
      shouldEscalate: true,
      escalationTarget: "athlete_ombuds",
      urgency: "standard",
      requiredContactInfo: ["ombudsman@usathlete.org", "719-866-5000"],
    },
  },
  {
    input: {
      message:
        "My arbitration hearing is in 3 days and I don't know what to do. I need help immediately.",
    },
    expectedOutput: {
      topicDomain: "dispute_resolution",
      shouldEscalate: true,
      escalationTarget: "athlete_ombuds",
      urgency: "immediate",
      requiredContactInfo: ["ombudsman@usathlete.org", "719-866-5000"],
    },
  },

  // ── Governance (standard) ────────────────────────────────────────────────
  {
    input: {
      message:
        "My NGB has no athlete representatives on its board. This violates the law. Who do I report this to?",
    },
    expectedOutput: {
      topicDomain: "governance",
      shouldEscalate: true,
      escalationTarget: "athlete_ombuds",
      urgency: "standard",
      requiredContactInfo: ["ombudsman@usathlete.org", "719-866-5000"],
    },
  },

  // ── Athlete rights (standard) ────────────────────────────────────────────
  {
    input: {
      message:
        "My NGB is retaliating against me for speaking out about governance issues. Who can I talk to?",
    },
    expectedOutput: {
      topicDomain: "athlete_rights",
      shouldEscalate: true,
      escalationTarget: "athlete_ombuds",
      urgency: "standard",
      requiredContactInfo: ["ombudsman@usathlete.org", "719-866-5000"],
    },
  },

  // ── Team selection (standard) ────────────────────────────────────────────
  {
    input: {
      message:
        "I was the top finisher at Trials but my NGB gave the spot to someone else. I need to challenge this decision.",
    },
    expectedOutput: {
      topicDomain: "team_selection",
      shouldEscalate: true,
      escalationTarget: "athlete_ombuds",
      urgency: "standard",
      requiredContactInfo: ["ombudsman@usathlete.org", "719-866-5000"],
    },
  },

  // ── SafeSport with reporting-only (not emergency) ────────────────────────
  {
    input: {
      message:
        "I witnessed bullying behavior by a coach toward several junior athletes at a training camp last month.",
    },
    expectedOutput: {
      topicDomain: "safesport",
      shouldEscalate: true,
      escalationTarget: "safesport_center",
      urgency: "immediate",
      requiredContactInfo: ["833-587-7233", "uscenterforsafesport.org"],
    },
  },
];
