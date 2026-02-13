export interface TrajectoryExample {
  input: { message: string };
  expectedOutput: {
    /** Ordered list of graph node names the agent should traverse. */
    trajectory: string[];
    /** Which graph path this represents. */
    pathType: "happy" | "clarify" | "escalate" | "low_confidence";
  };
}

/**
 * Curated trajectory evaluation dataset.
 *
 * Tests that the agent follows the correct graph path for different
 * query types. Covers all 4 main paths through the graph.
 */
export const trajectoryExamples: TrajectoryExample[] = [
  // ── Happy path (classifier → retriever → synthesizer → citationBuilder → disclaimerGuard) ──
  {
    input: {
      message: "What are the team selection criteria for USA Swimming?",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "retriever",
        "synthesizer",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "happy",
    },
  },
  {
    input: {
      message: "How does Section 9 arbitration work?",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "retriever",
        "synthesizer",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "happy",
    },
  },
  {
    input: {
      message:
        "What types of misconduct does the SafeSport Center investigate?",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "retriever",
        "synthesizer",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "happy",
    },
  },
  {
    input: {
      message: "What substances are on the prohibited list?",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "retriever",
        "synthesizer",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "happy",
    },
  },
  {
    input: {
      message:
        "What is the minimum athlete representation requirement on NGB boards?",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "retriever",
        "synthesizer",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "happy",
    },
  },

  // ── Clarify path (classifier → clarify) ──────────────────────────────────
  {
    input: {
      message: "What are the selection procedures?",
    },
    expectedOutput: {
      trajectory: ["classifier", "clarify"],
      pathType: "clarify",
    },
  },
  {
    input: {
      message: "How do I qualify?",
    },
    expectedOutput: {
      trajectory: ["classifier", "clarify"],
      pathType: "clarify",
    },
  },
  {
    input: {
      message: "Tell me about the rules.",
    },
    expectedOutput: {
      trajectory: ["classifier", "clarify"],
      pathType: "clarify",
    },
  },

  // ── Escalate path (classifier → escalate → citationBuilder → disclaimerGuard) ──
  {
    input: {
      message: "I need to report abuse by my coach.",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "escalate",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "escalate",
    },
  },
  {
    input: {
      message:
        "I just received notification of a potential anti-doping rule violation.",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "escalate",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "escalate",
    },
  },
  {
    input: {
      message:
        "I want to formally challenge my NGB's decision. My hearing is in 3 days.",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "escalate",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "escalate",
    },
  },

  // ── Low confidence / researcher path ─────────────────────────────────────
  // (classifier → retriever → researcher → synthesizer → citationBuilder → disclaimerGuard)
  // These queries are likely to have low retrieval confidence, triggering web search.
  {
    input: {
      message:
        "What changes were made to the Olympic qualification system for the 2028 Los Angeles Games?",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "retriever",
        "researcher",
        "synthesizer",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "low_confidence",
    },
  },
  {
    input: {
      message:
        "What is the latest update on the World Anti-Doping Code revisions for 2027?",
    },
    expectedOutput: {
      trajectory: [
        "classifier",
        "retriever",
        "researcher",
        "synthesizer",
        "citationBuilder",
        "disclaimerGuard",
      ],
      pathType: "low_confidence",
    },
  },
];
