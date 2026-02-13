import type { TopicDomain } from "@usopc/core";

export interface RetrievalExample {
  input: {
    message: string;
    topicDomain: TopicDomain;
    detectedNgbIds: string[];
  };
  /** Keywords or document titles expected in retrieval results. */
  expectedOutput: {
    expectedKeywords: string[];
  };
}

/**
 * Curated retrieval evaluation dataset.
 *
 * Tests whether the retriever returns documents containing expected
 * keywords/titles for a given query + domain + NGB combination.
 */
export const retrievalExamples: RetrievalExample[] = [
  // ── team_selection ───────────────────────────────────────────────────────
  {
    input: {
      message: "What are USA Swimming's Olympic team selection procedures?",
      topicDomain: "team_selection",
      detectedNgbIds: ["usa-swimming"],
    },
    expectedOutput: {
      expectedKeywords: ["selection", "procedures", "trials", "swimming"],
    },
  },
  {
    input: {
      message:
        "How does USA Track & Field select athletes for World Championships?",
      topicDomain: "team_selection",
      detectedNgbIds: ["usa-track-field"],
    },
    expectedOutput: {
      expectedKeywords: ["selection", "track", "field", "criteria"],
    },
  },
  {
    input: {
      message: "What is the alternate selection process for gymnastics?",
      topicDomain: "team_selection",
      detectedNgbIds: ["usa-gymnastics"],
    },
    expectedOutput: {
      expectedKeywords: ["alternate", "selection", "gymnastics"],
    },
  },
  {
    input: {
      message:
        "How are wrestling team members replaced if they cannot compete?",
      topicDomain: "team_selection",
      detectedNgbIds: ["usa-wrestling"],
    },
    expectedOutput: {
      expectedKeywords: ["replacement", "wrestling"],
    },
  },

  // ── dispute_resolution ───────────────────────────────────────────────────
  {
    input: {
      message: "How does Section 9 arbitration work?",
      topicDomain: "dispute_resolution",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["section 9", "arbitration", "dispute"],
    },
  },
  {
    input: {
      message: "What are the grounds for filing a grievance against an NGB?",
      topicDomain: "dispute_resolution",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["grievance", "NGB"],
    },
  },
  {
    input: {
      message: "What is the appeals process after a Section 9 decision?",
      topicDomain: "dispute_resolution",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["appeal", "section 9"],
    },
  },

  // ── safesport ────────────────────────────────────────────────────────────
  {
    input: {
      message: "What is the SafeSport code of conduct?",
      topicDomain: "safesport",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["safesport", "code", "conduct"],
    },
  },
  {
    input: {
      message: "What types of misconduct does SafeSport investigate?",
      topicDomain: "safesport",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["misconduct", "safesport", "investigate"],
    },
  },
  {
    input: {
      message: "What are the mandatory reporting obligations for coaches?",
      topicDomain: "safesport",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["reporting", "mandatory", "coach"],
    },
  },

  // ── anti_doping ──────────────────────────────────────────────────────────
  {
    input: {
      message: "What is the prohibited substance list?",
      topicDomain: "anti_doping",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["prohibited", "substance"],
    },
  },
  {
    input: {
      message: "How do I apply for a TUE?",
      topicDomain: "anti_doping",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["therapeutic", "use", "exemption", "TUE"],
    },
  },
  {
    input: {
      message:
        "What are the whereabouts requirements for athletes in the testing pool?",
      topicDomain: "anti_doping",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["whereabouts", "testing"],
    },
  },

  // ── eligibility ──────────────────────────────────────────────────────────
  {
    input: {
      message:
        "What are the citizenship requirements for competing on Team USA?",
      topicDomain: "eligibility",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["citizenship", "eligibility"],
    },
  },
  {
    input: {
      message: "What are the age requirements for Olympic diving?",
      topicDomain: "eligibility",
      detectedNgbIds: ["usa-diving"],
    },
    expectedOutput: {
      expectedKeywords: ["age", "eligibility", "diving"],
    },
  },

  // ── governance ───────────────────────────────────────────────────────────
  {
    input: {
      message:
        "What is the minimum athlete representation requirement on NGB boards?",
      topicDomain: "governance",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["athlete", "representation", "board"],
    },
  },
  {
    input: {
      message: "How are athlete representatives elected to the USOPC Board?",
      topicDomain: "governance",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["elected", "USOPC", "board"],
    },
  },

  // ── athlete_rights ───────────────────────────────────────────────────────
  {
    input: {
      message: "What is the Athlete Bill of Rights?",
      topicDomain: "athlete_rights",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["athlete", "bill", "rights"],
    },
  },
  {
    input: {
      message: "What are athletes' marketing and sponsorship rights?",
      topicDomain: "athlete_rights",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["marketing", "sponsorship", "rights"],
    },
  },
  {
    input: {
      message: "How is Olympic broadcast revenue shared with athletes?",
      topicDomain: "athlete_rights",
      detectedNgbIds: [],
    },
    expectedOutput: {
      expectedKeywords: ["revenue", "broadcast", "athlete"],
    },
  },
];
