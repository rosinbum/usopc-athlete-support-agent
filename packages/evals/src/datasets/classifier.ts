import type { TopicDomain, QueryIntent } from "@usopc/core";

export interface ClassifierExample {
  /** The user's message to classify. */
  input: { message: string };
  /** Expected classification output. */
  expectedOutput: {
    topicDomain: TopicDomain;
    queryIntent: QueryIntent;
    detectedNgbIds: string[];
    shouldEscalate: boolean;
    needsClarification: boolean;
  };
}

/**
 * Curated classifier evaluation dataset.
 *
 * Coverage:
 * - All 7 TopicDomain values (4+ examples each)
 * - All 5 QueryIntent values
 * - Escalation and clarification cases
 */
export const classifierExamples: ClassifierExample[] = [
  // ── team_selection (6 examples) ──────────────────────────────────────────
  {
    input: {
      message: "What are the team selection criteria for USA Swimming?",
    },
    expectedOutput: {
      topicDomain: "team_selection",
      queryIntent: "procedural",
      detectedNgbIds: ["usa-swimming"],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "How are athletes chosen for the US Olympic track and field team?",
    },
    expectedOutput: {
      topicDomain: "team_selection",
      queryIntent: "procedural",
      detectedNgbIds: ["usa-track-field"],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "When is the deadline to qualify for the US gymnastics team for the World Championships?",
    },
    expectedOutput: {
      topicDomain: "team_selection",
      queryIntent: "deadline",
      detectedNgbIds: ["usa-gymnastics"],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message: "Can the NGB replace a selected athlete after Trials?",
    },
    expectedOutput: {
      topicDomain: "team_selection",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: true,
    },
  },
  {
    input: {
      message:
        "I finished third at Olympic Trials for wrestling but wasn't named to the team. What are my options?",
    },
    expectedOutput: {
      topicDomain: "team_selection",
      queryIntent: "procedural",
      detectedNgbIds: ["usa-wrestling"],
      shouldEscalate: true,
      needsClarification: false,
    },
  },
  {
    input: {
      message: "What are the selection procedures?",
    },
    expectedOutput: {
      topicDomain: "team_selection",
      queryIntent: "procedural",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: true,
    },
  },

  // ── dispute_resolution (5 examples) ──────────────────────────────────────
  {
    input: {
      message:
        "How does the Section 9 arbitration process work for athlete grievances?",
    },
    expectedOutput: {
      topicDomain: "dispute_resolution",
      queryIntent: "procedural",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "What is the deadline to file a Section 9 complaint after a selection decision?",
    },
    expectedOutput: {
      topicDomain: "dispute_resolution",
      queryIntent: "deadline",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "I want to formally challenge my NGB's decision to not select me. The hearing is in 5 days.",
    },
    expectedOutput: {
      topicDomain: "dispute_resolution",
      queryIntent: "escalation",
      detectedNgbIds: [],
      shouldEscalate: true,
      needsClarification: false,
    },
  },
  {
    input: {
      message: "What are the grounds for appealing a CAS decision?",
    },
    expectedOutput: {
      topicDomain: "dispute_resolution",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "Can you explain how athlete grievance procedures differ from Section 9 arbitration?",
    },
    expectedOutput: {
      topicDomain: "dispute_resolution",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },

  // ── safesport (5 examples) ───────────────────────────────────────────────
  {
    input: {
      message: "I need to report abuse by my coach. He has been hitting me.",
    },
    expectedOutput: {
      topicDomain: "safesport",
      queryIntent: "escalation",
      detectedNgbIds: [],
      shouldEscalate: true,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "What types of misconduct does the SafeSport Center investigate?",
    },
    expectedOutput: {
      topicDomain: "safesport",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "How do I file an anonymous report about harassment at my training facility?",
    },
    expectedOutput: {
      topicDomain: "safesport",
      queryIntent: "procedural",
      detectedNgbIds: [],
      shouldEscalate: true,
      needsClarification: false,
    },
  },
  {
    input: {
      message: "What is the SafeSport training requirement for coaches?",
    },
    expectedOutput: {
      topicDomain: "safesport",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "A teammate confided in me that a coach is grooming a minor athlete. What should I do?",
    },
    expectedOutput: {
      topicDomain: "safesport",
      queryIntent: "escalation",
      detectedNgbIds: [],
      shouldEscalate: true,
      needsClarification: false,
    },
  },

  // ── anti_doping (5 examples) ─────────────────────────────────────────────
  {
    input: {
      message:
        "What substances are on the prohibited list for Olympic athletes?",
    },
    expectedOutput: {
      topicDomain: "anti_doping",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message: "How do I apply for a Therapeutic Use Exemption (TUE)?",
    },
    expectedOutput: {
      topicDomain: "anti_doping",
      queryIntent: "procedural",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "I just received notification of a potential anti-doping rule violation. What do I do?",
    },
    expectedOutput: {
      topicDomain: "anti_doping",
      queryIntent: "escalation",
      detectedNgbIds: [],
      shouldEscalate: true,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "When do I need to update my whereabouts information for out-of-competition testing?",
    },
    expectedOutput: {
      topicDomain: "anti_doping",
      queryIntent: "deadline",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message: "Can I use CBD products as a track and field athlete?",
    },
    expectedOutput: {
      topicDomain: "anti_doping",
      queryIntent: "factual",
      detectedNgbIds: ["usa-track-field"],
      shouldEscalate: false,
      needsClarification: false,
    },
  },

  // ── eligibility (4 examples) ─────────────────────────────────────────────
  {
    input: {
      message: "What are the age requirements for competing in Olympic diving?",
    },
    expectedOutput: {
      topicDomain: "eligibility",
      queryIntent: "factual",
      detectedNgbIds: ["usa-diving"],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "I have dual citizenship. Am I eligible to compete for Team USA in fencing?",
    },
    expectedOutput: {
      topicDomain: "eligibility",
      queryIntent: "factual",
      detectedNgbIds: ["usa-fencing"],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "What is the process to regain eligibility after a doping suspension?",
    },
    expectedOutput: {
      topicDomain: "eligibility",
      queryIntent: "procedural",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message: "Can a professional athlete compete in the Olympics for rowing?",
    },
    expectedOutput: {
      topicDomain: "eligibility",
      queryIntent: "factual",
      detectedNgbIds: ["usrowing"],
      shouldEscalate: false,
      needsClarification: false,
    },
  },

  // ── governance (4 examples) ──────────────────────────────────────────────
  {
    input: {
      message:
        "How many athlete representatives must be on an NGB's board of directors?",
    },
    expectedOutput: {
      topicDomain: "governance",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "What is the Athletes' Advisory Council and how are members chosen?",
    },
    expectedOutput: {
      topicDomain: "governance",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "My NGB is not following the minimum athlete representation requirements. Who can I report this to?",
    },
    expectedOutput: {
      topicDomain: "governance",
      queryIntent: "escalation",
      detectedNgbIds: [],
      shouldEscalate: true,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "How does the USOPC conduct compliance audits of national governing bodies?",
    },
    expectedOutput: {
      topicDomain: "governance",
      queryIntent: "procedural",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },

  // ── athlete_rights (4 examples) ──────────────────────────────────────────
  {
    input: {
      message: "What rights do athletes have under the Athlete Bill of Rights?",
    },
    expectedOutput: {
      topicDomain: "athlete_rights",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message: "Can my NGB restrict me from getting personal sponsors?",
    },
    expectedOutput: {
      topicDomain: "athlete_rights",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "How do I access my share of Olympic broadcast revenue as an athlete?",
    },
    expectedOutput: {
      topicDomain: "athlete_rights",
      queryIntent: "procedural",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "What protections exist for athletes who report abuse or governance violations?",
    },
    expectedOutput: {
      topicDomain: "athlete_rights",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },

  // ── universal framework (no clarification needed) ──────────────────────
  {
    input: {
      message:
        "My NGB changed selection criteria right before trials. Can I challenge this?",
    },
    expectedOutput: {
      topicDomain: "dispute_resolution",
      queryIntent: "procedural",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message: "My NGB won't let me compete because of unresolved fees.",
    },
    expectedOutput: {
      topicDomain: "dispute_resolution",
      queryIntent: "procedural",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "I'm a Paralympic athlete — my NGB has no disabled athletes on the board. Is this a violation?",
    },
    expectedOutput: {
      topicDomain: "governance",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "I want to run for my NGB's board as an athlete rep. What are the requirements?",
    },
    expectedOutput: {
      topicDomain: "governance",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },
  {
    input: {
      message:
        "I need a TUE for ADHD medication — will it affect team selection eligibility?",
    },
    expectedOutput: {
      topicDomain: "anti_doping",
      queryIntent: "factual",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: false,
    },
  },

  // ── general / ambiguous (3 examples) ─────────────────────────────────────
  {
    input: { message: "Hi, can you help me?" },
    expectedOutput: {
      topicDomain: "team_selection",
      queryIntent: "general",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: true,
    },
  },
  {
    input: {
      message: "Tell me about the Olympics.",
    },
    expectedOutput: {
      topicDomain: "team_selection",
      queryIntent: "general",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: true,
    },
  },
  {
    input: {
      message: "What do I need to know?",
    },
    expectedOutput: {
      topicDomain: "team_selection",
      queryIntent: "general",
      detectedNgbIds: [],
      shouldEscalate: false,
      needsClarification: true,
    },
  },
];
