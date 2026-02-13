export interface AnswerQualityExample {
  input: { message: string };
  /** Reference answer or key facts the agent's response must contain. */
  expectedOutput: {
    referenceAnswer: string;
    requiredFacts: string[];
  };
}

/**
 * Curated answer quality evaluation dataset.
 *
 * Each example includes a reference answer and required key facts
 * that must appear in the agent's response.
 */
export const answerQualityExamples: AnswerQualityExample[] = [
  // ── team_selection ───────────────────────────────────────────────────────
  {
    input: {
      message: "How does USA Swimming select athletes for the Olympic team?",
    },
    expectedOutput: {
      referenceAnswer:
        "USA Swimming selects Olympic team members primarily through performance at the U.S. Olympic Team Trials. " +
        "Athletes must achieve qualifying times and finish in the top positions at Trials to earn a spot on the team. " +
        "The specific selection procedures are published by USA Swimming before each Olympic cycle.",
      requiredFacts: [
        "Olympic Trials",
        "qualifying times",
        "selection procedures published by USA Swimming",
      ],
    },
  },
  {
    input: {
      message: "What is the deadline to file a Section 9 arbitration claim?",
    },
    expectedOutput: {
      referenceAnswer:
        "Under the Ted Stevens Olympic and Amateur Sports Act, an athlete must file a Section 9 arbitration " +
        "claim within a specified timeframe. The claim is filed with the American Arbitration Association (AAA). " +
        "The specific deadlines depend on the nature of the dispute.",
      requiredFacts: [
        "Ted Stevens Olympic and Amateur Sports Act",
        "American Arbitration Association",
      ],
    },
  },

  // ── safesport ────────────────────────────────────────────────────────────
  {
    input: {
      message:
        "What types of misconduct does the U.S. Center for SafeSport investigate?",
    },
    expectedOutput: {
      referenceAnswer:
        "The U.S. Center for SafeSport investigates reports of sexual misconduct, " +
        "emotional misconduct, physical misconduct, bullying, hazing, and harassment " +
        "within the U.S. Olympic and Paralympic Movement.",
      requiredFacts: [
        "sexual misconduct",
        "emotional misconduct",
        "physical misconduct",
        "bullying",
        "hazing",
        "harassment",
      ],
    },
  },
  {
    input: {
      message: "How do I file a report with SafeSport?",
    },
    expectedOutput: {
      referenceAnswer:
        "You can file a report with the U.S. Center for SafeSport through their website at " +
        "https://uscenterforsafesport.org/report-a-concern/ or by calling 833-587-7233. " +
        "Reports can be made anonymously.",
      requiredFacts: ["uscenterforsafesport.org", "833-587-7233", "anonymous"],
    },
  },

  // ── anti_doping ──────────────────────────────────────────────────────────
  {
    input: {
      message: "How do I apply for a Therapeutic Use Exemption?",
    },
    expectedOutput: {
      referenceAnswer:
        "To apply for a Therapeutic Use Exemption (TUE), you must submit an application through USADA. " +
        "The application requires documentation from your physician explaining the medical necessity of the " +
        "prohibited substance or method. USADA's TUE Committee reviews applications.",
      requiredFacts: ["USADA", "physician documentation", "medical necessity"],
    },
  },
  {
    input: {
      message: "What are the consequences of an anti-doping rule violation?",
    },
    expectedOutput: {
      referenceAnswer:
        "Consequences of an anti-doping rule violation can include ineligibility periods (suspensions), " +
        "disqualification of results, forfeiture of medals and prizes, and public disclosure. " +
        "The specific sanction depends on the substance, the circumstances, and whether it is a first offense.",
      requiredFacts: ["ineligibility", "disqualification", "forfeiture"],
    },
  },

  // ── dispute_resolution ───────────────────────────────────────────────────
  {
    input: {
      message: "What is Section 9 arbitration?",
    },
    expectedOutput: {
      referenceAnswer:
        "Section 9 of the Ted Stevens Olympic and Amateur Sports Act provides athletes with the right to " +
        "binding arbitration to resolve disputes with NGBs or the USOPC. Cases are heard by the American " +
        "Arbitration Association (AAA) and can cover team selection disputes, eligibility decisions, and " +
        "other athlete rights issues.",
      requiredFacts: [
        "Ted Stevens",
        "binding arbitration",
        "American Arbitration Association",
      ],
    },
  },
  {
    input: {
      message: "How do I contact the Athlete Ombuds?",
    },
    expectedOutput: {
      referenceAnswer:
        "The Athlete Ombuds provides free, confidential, and independent advice to athletes. " +
        "You can contact them at ombudsman@usathlete.org or 719-866-5000.",
      requiredFacts: [
        "ombudsman@usathlete.org",
        "719-866-5000",
        "free",
        "confidential",
      ],
    },
  },

  // ── governance ───────────────────────────────────────────────────────────
  {
    input: {
      message:
        "What is the minimum athlete representation requirement on NGB boards?",
    },
    expectedOutput: {
      referenceAnswer:
        "Under the Ted Stevens Act, NGBs must ensure that at least 33 1/3% (one-third) of their board " +
        "of directors consists of athlete representatives. These athletes must be elected by their peers.",
      requiredFacts: ["33", "one-third", "elected"],
    },
  },

  // ── eligibility ──────────────────────────────────────────────────────────
  {
    input: {
      message: "Can someone with dual citizenship compete for Team USA?",
    },
    expectedOutput: {
      referenceAnswer:
        "Athletes with dual citizenship may be eligible to compete for Team USA, but they must be a citizen " +
        "of the United States and meet the eligibility requirements of both the international federation and " +
        "the NGB. If the athlete has previously competed for another country, a waiting period or release may apply.",
      requiredFacts: ["citizen", "international federation", "NGB"],
    },
  },

  // ── athlete_rights ───────────────────────────────────────────────────────
  {
    input: {
      message: "What are athletes' marketing rights during the Olympic Games?",
    },
    expectedOutput: {
      referenceAnswer:
        "Athletes have the right to engage in personal sponsorships and marketing activities. " +
        "However, there are restrictions during the Games period (Rule 40) regarding commercial use of " +
        "Olympic intellectual property. The USOPC and IOC have specific guidelines for athlete marketing.",
      requiredFacts: ["sponsorship", "Rule 40"],
    },
  },
  {
    input: {
      message: "What is the Athlete Bill of Rights?",
    },
    expectedOutput: {
      referenceAnswer:
        "The Athlete Bill of Rights is a set of protections established by the Empowering Olympic, " +
        "Paralympic, and Amateur Athletes Act of 2020. It includes rights to fair selection procedures, " +
        "due process in disputes, athlete representation in governance, marketing and sponsorship rights, " +
        "and protection from retaliation.",
      requiredFacts: [
        "Empowering Olympic",
        "2020",
        "fair selection",
        "due process",
      ],
    },
  },

  // ── cross-domain ─────────────────────────────────────────────────────────
  {
    input: {
      message: "What should I do if I believe my NGB's selection was unfair?",
    },
    expectedOutput: {
      referenceAnswer:
        "If you believe a selection decision was unfair, you have several options: " +
        "1) Contact the Athlete Ombuds for confidential guidance. " +
        "2) File a grievance with your NGB. " +
        "3) Pursue Section 9 arbitration through the AAA. " +
        "Time limits apply, so act promptly.",
      requiredFacts: ["Athlete Ombuds", "grievance", "Section 9"],
    },
  },
  {
    input: {
      message:
        "I'm a cyclist and I want to understand the anti-doping testing process.",
    },
    expectedOutput: {
      referenceAnswer:
        "USADA conducts both in-competition and out-of-competition testing for athletes in the U.S. Olympic " +
        "and Paralympic Movement. Athletes may be subject to urine and/or blood sample collection. " +
        "Athletes in the registered testing pool must maintain whereabouts information.",
      requiredFacts: [
        "in-competition",
        "out-of-competition",
        "whereabouts",
        "USADA",
      ],
    },
  },
];
