/**
 * Quality review scenario suite.
 *
 * ~60 realistic test scenarios across 10 categories, designed to cover gaps
 * in the existing 16 answer-quality examples. Each scenario includes metadata
 * for filtering and optional expected output for reference.
 */

import type { TopicDomain } from "@usopc/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScenarioCategory =
  | "sport_specific"
  | "cross_domain"
  | "multi_turn"
  | "ambiguous"
  | "emotional_urgent"
  | "boundary"
  | "paralympic"
  | "financial"
  | "procedural_deep"
  | "current_events";

export type Difficulty = "easy" | "medium" | "hard";

export interface QualityReviewScenario {
  id: string;
  input: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    userSport?: string;
  };
  metadata: {
    category: ScenarioCategory;
    domains: TopicDomain[];
    difficulty: Difficulty;
    description: string;
  };
  expectedOutput?: {
    referenceAnswer?: string;
    requiredFacts?: string[];
    expectedPath?: string;
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const qualityReviewScenarios: QualityReviewScenario[] = [
  // =========================================================================
  // SPORT SPECIFIC (10) — NGBs beyond swimming
  // =========================================================================
  {
    id: "sport-01",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a USA Gymnastics athlete. What's the process for appealing a selection decision for the World Championships team?",
        },
      ],
      userSport: "gymnastics",
    },
    metadata: {
      category: "sport_specific",
      domains: ["team_selection"],
      difficulty: "medium",
      description:
        "Gymnastics-specific team selection appeal process for Worlds.",
    },
    expectedOutput: {
      requiredFacts: ["appeal process", "USA Gymnastics", "selection criteria"],
      expectedPath:
        "classifier → retriever → synthesizer → citationBuilder → disclaimerGuard",
    },
  },
  {
    id: "sport-02",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I compete in track and field under USATF. Can my NGB change selection criteria after the trials have been announced?",
        },
      ],
      userSport: "track_and_field",
    },
    metadata: {
      category: "sport_specific",
      domains: ["team_selection", "athlete_rights"],
      difficulty: "hard",
      description:
        "Whether USATF can retroactively change published selection criteria.",
    },
    expectedOutput: {
      requiredFacts: ["selection procedures", "athlete rights", "USATF"],
    },
  },
  {
    id: "sport-03",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a wrestler with USA Wrestling. My coach was banned by SafeSport but is still showing up at our training center. Who do I report this to?",
        },
      ],
      userSport: "wrestling",
    },
    metadata: {
      category: "sport_specific",
      domains: ["safesport"],
      difficulty: "medium",
      description:
        "SafeSport violation reporting for wrestling — banned coach present at facility.",
    },
    expectedOutput: {
      requiredFacts: ["U.S. Center for SafeSport", "report", "833-587-7233"],
      expectedPath: "classifier → escalate → citationBuilder → disclaimerGuard",
    },
  },
  {
    id: "sport-04",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm on the US Ski Team. What are my rights if I disagree with the medical clearance decision that's keeping me off the competition roster?",
        },
      ],
      userSport: "skiing",
    },
    metadata: {
      category: "sport_specific",
      domains: ["athlete_rights", "team_selection"],
      difficulty: "hard",
      description:
        "Skiing athlete challenging medical clearance decision affecting selection.",
    },
    expectedOutput: {
      requiredFacts: ["medical clearance", "appeal", "athlete rights"],
    },
  },
  {
    id: "sport-05",
    input: {
      messages: [
        {
          role: "user",
          content:
            "As a USA Boxing athlete, I want to understand the weight class rules for Olympic qualification. Where can I find the official criteria?",
        },
      ],
      userSport: "boxing",
    },
    metadata: {
      category: "sport_specific",
      domains: ["eligibility"],
      difficulty: "easy",
      description: "Boxing weight class and Olympic qualification criteria.",
    },
    expectedOutput: {
      requiredFacts: ["USA Boxing", "weight class", "Olympic qualification"],
    },
  },
  {
    id: "sport-06",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a US Rowing athlete and my NGB just changed our governance structure. Do they have to consult athletes before making changes to the board?",
        },
      ],
      userSport: "rowing",
    },
    metadata: {
      category: "sport_specific",
      domains: ["governance", "athlete_rights"],
      difficulty: "hard",
      description:
        "Rowing NGB governance change — athlete representation requirements.",
    },
    expectedOutput: {
      requiredFacts: ["athlete representation", "governance", "board", "33%"],
    },
  },
  {
    id: "sport-07",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I fence for the US and need to know: does USA Fencing have its own anti-doping testing program or does it all go through USADA?",
        },
      ],
      userSport: "fencing",
    },
    metadata: {
      category: "sport_specific",
      domains: ["anti_doping"],
      difficulty: "medium",
      description: "Fencing anti-doping — NGB vs USADA testing relationship.",
    },
    expectedOutput: {
      requiredFacts: ["USADA", "testing", "anti-doping"],
    },
  },
  {
    id: "sport-08",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a USA Cycling athlete. My team selection was based on rankings, but I think the points calculation had an error. What can I do?",
        },
      ],
      userSport: "cycling",
    },
    metadata: {
      category: "sport_specific",
      domains: ["team_selection", "dispute_resolution"],
      difficulty: "hard",
      description:
        "Cycling points calculation dispute affecting team selection.",
    },
    expectedOutput: {
      requiredFacts: [
        "grievance",
        "dispute resolution",
        "USA Cycling",
        "appeal",
      ],
    },
  },
  {
    id: "sport-09",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I play on the US Women's National Soccer Team. Can you explain how the Athlete Advisory Council works at US Soccer?",
        },
      ],
      userSport: "soccer",
    },
    metadata: {
      category: "sport_specific",
      domains: ["governance", "athlete_rights"],
      difficulty: "easy",
      description: "Soccer athlete advisory council structure and purpose.",
    },
    expectedOutput: {
      requiredFacts: ["Athlete Advisory Council", "athlete representation"],
    },
  },
  {
    id: "sport-10",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a USA Weightlifting athlete who just received a whereabouts failure. This is my first one — what happens next and how long does it stay on my record?",
        },
      ],
      userSport: "weightlifting",
    },
    metadata: {
      category: "sport_specific",
      domains: ["anti_doping"],
      difficulty: "medium",
      description:
        "Weightlifting whereabouts failure consequences and timeline.",
    },
    expectedOutput: {
      requiredFacts: [
        "whereabouts failure",
        "12 months",
        "USADA",
        "anti-doping rule violation",
      ],
    },
  },

  // =========================================================================
  // CROSS DOMAIN (8) — spanning 2+ topic domains
  // =========================================================================
  {
    id: "cross-01",
    input: {
      messages: [
        {
          role: "user",
          content:
            "My coach was just suspended for a SafeSport violation, and now my NGB is saying I can't compete because I trained with a banned person. Is that allowed?",
        },
      ],
    },
    metadata: {
      category: "cross_domain",
      domains: ["safesport", "eligibility", "athlete_rights"],
      difficulty: "hard",
      description:
        "SafeSport ban affecting athlete's eligibility — intersection of SafeSport and athlete rights.",
    },
    expectedOutput: {
      requiredFacts: [
        "SafeSport",
        "eligibility",
        "association",
        "athlete rights",
      ],
    },
  },
  {
    id: "cross-02",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I failed a drug test and I'm also in the middle of a team selection appeal. Are these processes separate or does one affect the other?",
        },
      ],
    },
    metadata: {
      category: "cross_domain",
      domains: ["anti_doping", "team_selection", "dispute_resolution"],
      difficulty: "hard",
      description:
        "Intersection of anti-doping violation and team selection appeal.",
    },
    expectedOutput: {
      requiredFacts: [
        "provisional suspension",
        "USADA",
        "team selection",
        "appeal",
      ],
    },
  },
  {
    id: "cross-03",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I want to file a grievance against my NGB about how they handled a SafeSport report involving my teammate. What's the right process?",
        },
      ],
    },
    metadata: {
      category: "cross_domain",
      domains: ["safesport", "dispute_resolution", "governance"],
      difficulty: "hard",
      description:
        "Grievance about NGB SafeSport handling — dispute resolution + SafeSport.",
    },
    expectedOutput: {
      requiredFacts: ["grievance", "SafeSport", "dispute resolution"],
    },
  },
  {
    id: "cross-04",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a Paralympic athlete and I'm concerned about the governance of my NGB — they don't have any disabled athletes on the board. Is this a violation?",
        },
      ],
    },
    metadata: {
      category: "cross_domain",
      domains: ["governance", "athlete_rights"],
      difficulty: "medium",
      description:
        "Paralympic athlete representation on NGB board — governance + athlete rights.",
    },
    expectedOutput: {
      requiredFacts: ["athlete representation", "33%", "board", "Paralympic"],
    },
  },
  {
    id: "cross-05",
    input: {
      messages: [
        {
          role: "user",
          content:
            "My NGB changed their selection criteria right before trials. I was going to make the team under the old rules. Can I challenge this and also, is this a governance issue I can report to the USOPC?",
        },
      ],
    },
    metadata: {
      category: "cross_domain",
      domains: ["team_selection", "governance", "dispute_resolution"],
      difficulty: "hard",
      description:
        "Late selection criteria change — team selection + governance complaint.",
    },
    expectedOutput: {
      requiredFacts: [
        "selection criteria",
        "grievance",
        "USOPC",
        "athlete rights",
      ],
    },
  },
  {
    id: "cross-06",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I need a TUE for my ADHD medication and I'm worried it could affect my eligibility for the upcoming national team selection. How do I handle both?",
        },
      ],
    },
    metadata: {
      category: "cross_domain",
      domains: ["anti_doping", "eligibility", "team_selection"],
      difficulty: "medium",
      description:
        "TUE for ADHD medication intersecting with team selection eligibility.",
    },
    expectedOutput: {
      requiredFacts: [
        "TUE",
        "Therapeutic Use Exemption",
        "USADA",
        "eligibility",
      ],
    },
  },
  {
    id: "cross-07",
    input: {
      messages: [
        {
          role: "user",
          content:
            "My NGB won't let me compete because of an unresolved financial dispute with them. They say I owe membership fees. Can they block my eligibility for that?",
        },
      ],
    },
    metadata: {
      category: "cross_domain",
      domains: ["eligibility", "dispute_resolution", "athlete_rights"],
      difficulty: "medium",
      description:
        "NGB blocking competition eligibility over financial dispute.",
    },
    expectedOutput: {
      requiredFacts: ["eligibility", "dispute", "athlete rights"],
    },
  },
  {
    id: "cross-08",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm being retaliated against by my NGB after I reported a SafeSport concern. They've dropped me from the training squad. What protections do I have?",
        },
      ],
    },
    metadata: {
      category: "cross_domain",
      domains: ["safesport", "athlete_rights"],
      difficulty: "hard",
      description: "Retaliation after SafeSport report — athlete protections.",
    },
    expectedOutput: {
      requiredFacts: [
        "retaliation",
        "SafeSport",
        "athlete rights",
        "protection",
      ],
      expectedPath: "classifier → escalate → citationBuilder → disclaimerGuard",
    },
  },

  // =========================================================================
  // MULTI TURN (8) — 2-3 message conversation sequences
  // =========================================================================
  {
    id: "multi-01",
    input: {
      messages: [
        {
          role: "user",
          content: "How do I file a grievance against my NGB?",
        },
        {
          role: "assistant",
          content:
            "To file a grievance against your NGB, you can use the dispute resolution process under Section 9 of the Ted Stevens Act...",
        },
        {
          role: "user",
          content:
            "OK, but what if my NGB ignores the grievance? Can I go directly to the USOPC or do I have to go through arbitration first?",
        },
      ],
    },
    metadata: {
      category: "multi_turn",
      domains: ["dispute_resolution"],
      difficulty: "medium",
      description:
        "Follow-up on grievance process — escalation path when NGB is unresponsive.",
    },
    expectedOutput: {
      requiredFacts: ["arbitration", "USOPC", "AAA", "Section 9"],
    },
  },
  {
    id: "multi-02",
    input: {
      messages: [
        {
          role: "user",
          content: "What are the anti-doping rules I need to follow?",
        },
        {
          role: "assistant",
          content:
            "As a US Olympic or Paralympic athlete, you're subject to the World Anti-Doping Code and USADA's protocols...",
        },
        {
          role: "user",
          content:
            "I take a prescription medication for asthma. Do I need to declare it somehow?",
        },
      ],
    },
    metadata: {
      category: "multi_turn",
      domains: ["anti_doping"],
      difficulty: "easy",
      description:
        "Follow-up about prescription medication — TUE requirement for asthma.",
    },
    expectedOutput: {
      requiredFacts: [
        "TUE",
        "Therapeutic Use Exemption",
        "USADA",
        "declaration",
      ],
    },
  },
  {
    id: "multi-03",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I want to understand how team selection works for the Olympics.",
        },
        {
          role: "assistant",
          content:
            "Olympic team selection is managed by each NGB according to criteria they develop and submit to the USOPC...",
        },
        {
          role: "user",
          content:
            "What if I think the selection criteria are unfair? Like, what if they favor athletes who train at specific centers?",
        },
        {
          role: "assistant",
          content:
            "If you believe the selection criteria are unfair, you have several options...",
        },
        {
          role: "user",
          content:
            "Has anyone ever successfully challenged selection criteria? I want to know if it's even worth trying.",
        },
      ],
    },
    metadata: {
      category: "multi_turn",
      domains: ["team_selection", "dispute_resolution"],
      difficulty: "hard",
      description:
        "Three-turn conversation about challenging selection criteria — seeking precedent.",
    },
    expectedOutput: {
      requiredFacts: ["appeal", "arbitration", "selection criteria"],
    },
  },
  {
    id: "multi-04",
    input: {
      messages: [
        {
          role: "user",
          content:
            "Someone on my team has been bullying me and making inappropriate comments.",
        },
        {
          role: "assistant",
          content:
            "I'm sorry to hear you're experiencing this. This sounds like it could be a SafeSport concern...",
        },
        {
          role: "user",
          content:
            "It's another athlete, not a coach. Does SafeSport still cover that?",
        },
      ],
    },
    metadata: {
      category: "multi_turn",
      domains: ["safesport"],
      difficulty: "medium",
      description:
        "Follow-up clarifying SafeSport scope — athlete-on-athlete misconduct.",
    },
    expectedOutput: {
      requiredFacts: [
        "SafeSport",
        "athlete-on-athlete",
        "report",
        "U.S. Center for SafeSport",
      ],
    },
  },
  {
    id: "multi-05",
    input: {
      messages: [
        {
          role: "user",
          content: "What grants are available through the USOPC?",
        },
        {
          role: "assistant",
          content:
            "The USOPC provides several forms of financial support for athletes...",
        },
        {
          role: "user",
          content:
            "I specifically want to know about health insurance. My NGB doesn't offer it. Does the USOPC provide coverage?",
        },
      ],
    },
    metadata: {
      category: "multi_turn",
      domains: ["athlete_rights"],
      difficulty: "medium",
      description:
        "Follow-up narrowing from general grants to health insurance availability.",
    },
    expectedOutput: {
      requiredFacts: ["health insurance", "USOPC", "athlete benefits"],
    },
  },
  {
    id: "multi-06",
    input: {
      messages: [
        {
          role: "user",
          content: "I'm a dual citizen. Can I compete for the US?",
        },
        {
          role: "assistant",
          content:
            "Dual citizenship eligibility depends on several factors including your NGB's rules and the international federation's regulations...",
        },
        {
          role: "user",
          content:
            "I competed for another country two years ago. Does that change anything?",
        },
      ],
    },
    metadata: {
      category: "multi_turn",
      domains: ["eligibility"],
      difficulty: "hard",
      description:
        "Follow-up on dual citizen eligibility with prior representation for another country.",
    },
    expectedOutput: {
      requiredFacts: [
        "transfer of allegiance",
        "waiting period",
        "international federation",
      ],
    },
  },
  {
    id: "multi-07",
    input: {
      messages: [
        {
          role: "user",
          content:
            "Can you explain the role of the Athletes' Advisory Council?",
        },
        {
          role: "assistant",
          content:
            "The Athletes' Advisory Council (AAC) is the athlete representative body within the USOPC...",
        },
        {
          role: "user",
          content:
            "How do I get elected to the AAC? What are the requirements?",
        },
      ],
    },
    metadata: {
      category: "multi_turn",
      domains: ["governance", "athlete_rights"],
      difficulty: "medium",
      description:
        "Follow-up on AAC election process and eligibility requirements.",
    },
    expectedOutput: {
      requiredFacts: ["election", "Athletes' Advisory Council", "10-year rule"],
    },
  },
  {
    id: "multi-08",
    input: {
      messages: [
        {
          role: "user",
          content: "What happens if I get injured at a USOPC training center?",
        },
        {
          role: "assistant",
          content:
            "If you're injured at an Olympic & Paralympic Training Center, the USOPC provides medical services...",
        },
        {
          role: "user",
          content:
            "What if the injury was caused by negligence — like faulty equipment? Can I sue?",
        },
      ],
    },
    metadata: {
      category: "multi_turn",
      domains: ["athlete_rights"],
      difficulty: "hard",
      description:
        "Follow-up about liability for negligence-caused injury at training center.",
    },
    expectedOutput: {
      requiredFacts: ["liability", "negligence"],
    },
  },

  // =========================================================================
  // AMBIGUOUS (6) — vague queries that should trigger clarification
  // =========================================================================
  {
    id: "ambig-01",
    input: {
      messages: [
        {
          role: "user",
          content: "I need help with my situation.",
        },
      ],
    },
    metadata: {
      category: "ambiguous",
      domains: [],
      difficulty: "easy",
      description:
        "Extremely vague query — should request clarification about the nature of the issue.",
    },
    expectedOutput: {
      expectedPath: "classifier → clarify",
    },
  },
  {
    id: "ambig-02",
    input: {
      messages: [
        {
          role: "user",
          content: "Can you help me with the rules?",
        },
      ],
    },
    metadata: {
      category: "ambiguous",
      domains: [],
      difficulty: "easy",
      description:
        "Vague 'rules' reference — should clarify which rules (selection, anti-doping, eligibility, etc.).",
    },
    expectedOutput: {
      expectedPath: "classifier → clarify",
    },
  },
  {
    id: "ambig-03",
    input: {
      messages: [
        {
          role: "user",
          content: "Someone told me I might have a problem. What should I do?",
        },
      ],
    },
    metadata: {
      category: "ambiguous",
      domains: [],
      difficulty: "easy",
      description:
        "Vague 'problem' — could be doping, SafeSport, eligibility. Should ask for specifics.",
    },
    expectedOutput: {
      expectedPath: "classifier → clarify",
    },
  },
  {
    id: "ambig-04",
    input: {
      messages: [
        {
          role: "user",
          content: "I want to file a complaint.",
        },
      ],
    },
    metadata: {
      category: "ambiguous",
      domains: ["dispute_resolution"],
      difficulty: "easy",
      description:
        "Complaint without context — should clarify nature (SafeSport, governance, selection, etc.).",
    },
    expectedOutput: {
      expectedPath: "classifier → clarify",
    },
  },
  {
    id: "ambig-05",
    input: {
      messages: [
        {
          role: "user",
          content: "Is there a deadline I should know about?",
        },
      ],
    },
    metadata: {
      category: "ambiguous",
      domains: [],
      difficulty: "easy",
      description:
        "Deadline without context — many processes have deadlines, should clarify.",
    },
    expectedOutput: {
      expectedPath: "classifier → clarify",
    },
  },
  {
    id: "ambig-06",
    input: {
      messages: [
        {
          role: "user",
          content: "I heard something changed recently. What's new?",
        },
      ],
    },
    metadata: {
      category: "ambiguous",
      domains: [],
      difficulty: "medium",
      description:
        "Vague reference to changes — should clarify what area they're asking about.",
    },
    expectedOutput: {
      expectedPath: "classifier → clarify",
    },
  },

  // =========================================================================
  // EMOTIONAL / URGENT (5) — distressed athlete tone
  // =========================================================================
  {
    id: "emot-01",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm terrified. My coach has been making sexual comments and I don't know who to trust. I'm afraid if I report it I'll be cut from the team. Please help me.",
        },
      ],
    },
    metadata: {
      category: "emotional_urgent",
      domains: ["safesport"],
      difficulty: "medium",
      description:
        "Distressed athlete reporting sexual harassment — needs empathetic tone and SafeSport escalation.",
    },
    expectedOutput: {
      requiredFacts: [
        "U.S. Center for SafeSport",
        "833-587-7233",
        "retaliation protection",
        "confidential",
        "right to speak up",
      ],
      expectedPath: "classifier → escalate → citationBuilder → disclaimerGuard",
    },
  },
  {
    id: "emot-02",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I just got notified that I failed a drug test but I NEVER took anything intentionally. I'm panicking — my career could be over. What do I do RIGHT NOW?",
        },
      ],
    },
    metadata: {
      category: "emotional_urgent",
      domains: ["anti_doping"],
      difficulty: "medium",
      description:
        "Panicked athlete after positive test — needs calm guidance and immediate steps.",
    },
    expectedOutput: {
      requiredFacts: [
        "USADA",
        "B sample",
        "provisional suspension",
        "legal counsel",
        "concrete steps",
      ],
      expectedPath: "classifier → escalate → citationBuilder → disclaimerGuard",
    },
  },
  {
    id: "emot-03",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I feel completely alone. The selection committee overlooked me and I don't think it was fair. Nobody at my NGB will return my calls. I've given everything to this sport and now I don't know what to do with my life.",
        },
      ],
    },
    metadata: {
      category: "emotional_urgent",
      domains: ["team_selection", "athlete_rights"],
      difficulty: "hard",
      description:
        "Emotionally distressed athlete — needs empathy, appeal process guidance, and mental health resources.",
    },
    expectedOutput: {
      requiredFacts: [
        "appeal",
        "grievance",
        "mental health",
        "support",
        "what you're feeling is valid",
      ],
    },
  },
  {
    id: "emot-04",
    input: {
      messages: [
        {
          role: "user",
          content:
            "My teammate just confided in me that they were abused by a staff member years ago. They made me promise not to tell but I feel like I have to. What's my obligation?",
        },
      ],
    },
    metadata: {
      category: "emotional_urgent",
      domains: ["safesport"],
      difficulty: "hard",
      description:
        "Moral dilemma — reporting obligation vs. teammate confidence for historical abuse.",
    },
    expectedOutput: {
      requiredFacts: [
        "mandatory reporting",
        "SafeSport",
        "U.S. Center for SafeSport",
      ],
    },
  },
  {
    id: "emot-05",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a minor and my parents don't support my athletic career. Can I still compete? My NGB says they need parental consent for everything.",
        },
      ],
    },
    metadata: {
      category: "emotional_urgent",
      domains: ["eligibility", "athlete_rights"],
      difficulty: "hard",
      description:
        "Minor athlete without parental support — eligibility and consent issues.",
    },
    expectedOutput: {
      requiredFacts: ["minor", "parental consent", "athlete rights", "support"],
    },
  },

  // =========================================================================
  // BOUNDARY (6) — near-scope and out-of-scope questions
  // =========================================================================
  {
    id: "bound-01",
    input: {
      messages: [
        {
          role: "user",
          content:
            "What's the best protein powder for recovery after training?",
        },
      ],
    },
    metadata: {
      category: "boundary",
      domains: [],
      difficulty: "easy",
      description:
        "Out of scope — nutrition advice. Should deflect while noting supplement safety per USADA.",
    },
    expectedOutput: {
      expectedPath: "classifier → clarify",
    },
  },
  {
    id: "bound-02",
    input: {
      messages: [
        {
          role: "user",
          content: "Can you help me write a sponsorship proposal for Nike?",
        },
      ],
    },
    metadata: {
      category: "boundary",
      domains: [],
      difficulty: "easy",
      description: "Out of scope — commercial sponsorship negotiation.",
    },
  },
  {
    id: "bound-03",
    input: {
      messages: [
        {
          role: "user",
          content:
            "My NGB's executive director is embezzling funds. Athletes have reported it but nothing happens. Can the USOPC intervene?",
        },
      ],
    },
    metadata: {
      category: "boundary",
      domains: ["governance"],
      difficulty: "medium",
      description:
        "Near-scope — NGB financial misconduct. In scope for governance but may need legal referral.",
    },
    expectedOutput: {
      requiredFacts: ["USOPC", "governance", "complaint", "audit"],
    },
  },
  {
    id: "bound-04",
    input: {
      messages: [
        {
          role: "user",
          content:
            "What do you think about the IOC's new rules on transgender athletes? Are they fair?",
        },
      ],
    },
    metadata: {
      category: "boundary",
      domains: ["eligibility"],
      difficulty: "hard",
      description:
        "Boundary — asks for an opinion on a policy matter. Should present facts without taking a position.",
    },
  },
  {
    id: "bound-05",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I want to sue my NGB for discrimination. Can you recommend a lawyer?",
        },
      ],
    },
    metadata: {
      category: "boundary",
      domains: ["dispute_resolution", "athlete_rights"],
      difficulty: "medium",
      description:
        "Boundary — legal referral request. Should explain dispute resolution options, not recommend lawyers.",
    },
    expectedOutput: {},
  },
  {
    id: "bound-06",
    input: {
      messages: [
        {
          role: "user",
          content: "How do I get a visa to compete internationally?",
        },
      ],
    },
    metadata: {
      category: "boundary",
      domains: [],
      difficulty: "easy",
      description:
        "Out of scope — visa/immigration question. May have limited USOPC resources to point to.",
    },
  },

  // =========================================================================
  // PARALYMPIC (5) — Paralympic-specific questions
  // =========================================================================
  {
    id: "para-01",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a wheelchair basketball player. How does the classification process work, and what do I do if I disagree with my classification?",
        },
      ],
    },
    metadata: {
      category: "paralympic",
      domains: ["eligibility"],
      difficulty: "medium",
      description: "Paralympic classification process and appeal mechanism.",
    },
    expectedOutput: {
      requiredFacts: [
        "classification",
        "protest",
        "International Paralympic Committee",
      ],
    },
  },
  {
    id: "para-02",
    input: {
      messages: [
        {
          role: "user",
          content:
            "Are there specific grants or funding programs available for Paralympic athletes that differ from Olympic athlete funding?",
        },
      ],
    },
    metadata: {
      category: "paralympic",
      domains: ["athlete_rights"],
      difficulty: "medium",
      description: "Paralympic-specific funding and financial support.",
    },
    expectedOutput: {
      requiredFacts: ["USOPC", "funding", "Paralympic"],
    },
  },
  {
    id: "para-03",
    input: {
      messages: [
        {
          role: "user",
          content:
            "My NGB doesn't have an adaptive/Paralympic program. How can I still get on the path to the Paralympics?",
        },
      ],
    },
    metadata: {
      category: "paralympic",
      domains: ["eligibility", "governance"],
      difficulty: "hard",
      description:
        "Athlete whose NGB lacks Paralympic pathway — alternative routes.",
    },
    expectedOutput: {},
  },
  {
    id: "para-04",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a guide runner for a visually impaired athlete. Do I have any athlete rights or protections under the USOPC?",
        },
      ],
    },
    metadata: {
      category: "paralympic",
      domains: ["athlete_rights"],
      difficulty: "hard",
      description:
        "Guide runner rights — niche Paralympic question about non-athlete participant protections.",
    },
    expectedOutput: {
      requiredFacts: ["guide", "athlete rights"],
    },
  },
  {
    id: "para-05",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a sitting volleyball athlete who needs accessible facilities at the training center. My requests keep being ignored. What can I do?",
        },
      ],
    },
    metadata: {
      category: "paralympic",
      domains: ["athlete_rights", "governance"],
      difficulty: "medium",
      description:
        "Accessibility concerns at training center — disability accommodation rights.",
    },
    expectedOutput: {
      requiredFacts: ["accessibility", "accommodation", "athlete rights"],
    },
  },

  // =========================================================================
  // FINANCIAL (5) — grants, stipends, sponsorship
  // =========================================================================
  {
    id: "fin-01",
    input: {
      messages: [
        {
          role: "user",
          content:
            "What financial support does the USOPC provide to athletes? I'm struggling to cover my training costs.",
        },
      ],
    },
    metadata: {
      category: "financial",
      domains: ["athlete_rights"],
      difficulty: "easy",
      description: "General overview of USOPC athlete financial support.",
    },
    expectedOutput: {
      requiredFacts: ["stipend", "grant", "USOPC", "funding"],
    },
  },
  {
    id: "fin-02",
    input: {
      messages: [
        {
          role: "user",
          content:
            "Do I have to pay taxes on my Olympic medal bonus? What about training grants from the USOPC?",
        },
      ],
    },
    metadata: {
      category: "financial",
      domains: ["athlete_rights"],
      difficulty: "medium",
      description: "Tax implications of medal bonuses and USOPC grants.",
    },
    expectedOutput: {
      requiredFacts: ["tax", "medal bonus"],
    },
  },
  {
    id: "fin-03",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I'm a developing athlete ranked in the top 20 nationally. Am I eligible for Operation Gold or any tiered funding?",
        },
      ],
    },
    metadata: {
      category: "financial",
      domains: ["athlete_rights", "eligibility"],
      difficulty: "medium",
      description: "Operation Gold eligibility and tiered funding criteria.",
    },
    expectedOutput: {},
  },
  {
    id: "fin-04",
    input: {
      messages: [
        {
          role: "user",
          content:
            "My NGB provides a monthly stipend but recently cut it without notice. Can they do that? Do I have any recourse?",
        },
      ],
    },
    metadata: {
      category: "financial",
      domains: ["athlete_rights", "dispute_resolution"],
      difficulty: "hard",
      description:
        "NGB stipend cut without notice — athlete financial protections.",
    },
    expectedOutput: {},
  },
  {
    id: "fin-05",
    input: {
      messages: [
        {
          role: "user",
          content:
            "What are the rules around endorsement deals? Can my NGB restrict which sponsors I can work with?",
        },
      ],
    },
    metadata: {
      category: "financial",
      domains: ["athlete_rights"],
      difficulty: "medium",
      description:
        "NGB restrictions on athlete personal sponsorships and endorsements.",
    },
    expectedOutput: {
      requiredFacts: [
        "sponsorship",
        "endorsement",
        "athlete rights",
        "marketing",
      ],
    },
  },

  // =========================================================================
  // PROCEDURAL DEEP (5) — deep procedural detail
  // =========================================================================
  {
    id: "proc-01",
    input: {
      messages: [
        {
          role: "user",
          content:
            "Walk me through the exact steps and timelines for filing a Section 9 complaint against my NGB with the USOPC.",
        },
      ],
    },
    metadata: {
      category: "procedural_deep",
      domains: ["dispute_resolution"],
      difficulty: "hard",
      description:
        "Detailed Section 9 complaint filing procedure with timelines.",
    },
    expectedOutput: {
      requiredFacts: ["Section 9", "complaint", "USOPC", "timeline", "filing"],
    },
  },
  {
    id: "proc-02",
    input: {
      messages: [
        {
          role: "user",
          content:
            "What are the exact steps for requesting a B sample analysis after a positive anti-doping test, and what are the deadlines at each stage?",
        },
      ],
    },
    metadata: {
      category: "procedural_deep",
      domains: ["anti_doping"],
      difficulty: "hard",
      description:
        "B sample request procedure and deadlines after positive test.",
    },
    expectedOutput: {
      requiredFacts: [
        "B sample",
        "USADA",
        "notification",
        "deadline",
        "laboratory",
      ],
    },
  },
  {
    id: "proc-03",
    input: {
      messages: [
        {
          role: "user",
          content:
            "Step by step, how do I file a formal SafeSport report? What information do I need, and what happens after I submit it?",
        },
      ],
    },
    metadata: {
      category: "procedural_deep",
      domains: ["safesport"],
      difficulty: "medium",
      description:
        "Complete SafeSport reporting procedure with post-filing process.",
    },
    expectedOutput: {
      requiredFacts: [
        "U.S. Center for SafeSport",
        "report",
        "investigation",
        "intake",
      ],
    },
  },
  {
    id: "proc-04",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I want to run for my NGB's board of directors as an athlete representative. What are the legal requirements for athlete representation and how does the nomination process work?",
        },
      ],
    },
    metadata: {
      category: "procedural_deep",
      domains: ["governance", "athlete_rights"],
      difficulty: "hard",
      description:
        "NGB board athlete representation nomination process and requirements.",
    },
    expectedOutput: {},
  },
  {
    id: "proc-05",
    input: {
      messages: [
        {
          role: "user",
          content:
            "What is the complete CAS arbitration process for a team selection dispute? From filing to hearing to decision — what should I expect at each stage?",
        },
      ],
    },
    metadata: {
      category: "procedural_deep",
      domains: ["dispute_resolution", "team_selection"],
      difficulty: "hard",
      description:
        "Full CAS arbitration procedure for team selection disputes.",
    },
    expectedOutput: {
      requiredFacts: [
        "CAS",
        "Court of Arbitration for Sport",
        "arbitration",
        "hearing",
        "filing",
      ],
    },
  },

  // =========================================================================
  // CURRENT EVENTS (4) — questions about recent/upcoming events
  // =========================================================================
  {
    id: "curr-01",
    input: {
      messages: [
        {
          role: "user",
          content:
            "When are the next Olympic Trials for track and field, and have the selection criteria been published yet?",
        },
      ],
      userSport: "track_and_field",
    },
    metadata: {
      category: "current_events",
      domains: ["team_selection"],
      difficulty: "medium",
      description:
        "Upcoming Olympic Trials dates and published selection criteria.",
    },
    expectedOutput: {
      requiredFacts: ["Olympic Trials", "selection criteria", "USATF"],
    },
  },
  {
    id: "curr-02",
    input: {
      messages: [
        {
          role: "user",
          content:
            "Have there been any recent changes to USADA's testing protocols or the whereabouts requirements?",
        },
      ],
    },
    metadata: {
      category: "current_events",
      domains: ["anti_doping"],
      difficulty: "hard",
      description:
        "Recent USADA policy changes — may require web search fallback.",
    },
    expectedOutput: {
      requiredFacts: ["USADA", "whereabouts", "testing"],
    },
  },
  {
    id: "curr-03",
    input: {
      messages: [
        {
          role: "user",
          content:
            "I heard the USOPC is restructuring how NGB compliance is monitored. What's changing?",
        },
      ],
    },
    metadata: {
      category: "current_events",
      domains: ["governance"],
      difficulty: "hard",
      description:
        "Recent USOPC governance/compliance changes — may not be in KB yet.",
    },
    expectedOutput: {
      requiredFacts: ["USOPC", "compliance", "NGB"],
    },
  },
  {
    id: "curr-04",
    input: {
      messages: [
        {
          role: "user",
          content:
            "Are there any upcoming deadlines for NGB athlete representative elections that I should know about?",
        },
      ],
    },
    metadata: {
      category: "current_events",
      domains: ["governance", "athlete_rights"],
      difficulty: "medium",
      description: "Upcoming athlete representative election deadlines.",
    },
    expectedOutput: {
      requiredFacts: ["election", "athlete representative", "deadline"],
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get scenarios for a specific category. */
export function getScenariosByCategory(
  category: ScenarioCategory,
): QualityReviewScenario[] {
  return qualityReviewScenarios.filter((s) => s.metadata.category === category);
}

/** Get scenarios by difficulty level. */
export function getScenariosByDifficulty(
  difficulty: Difficulty,
): QualityReviewScenario[] {
  return qualityReviewScenarios.filter(
    (s) => s.metadata.difficulty === difficulty,
  );
}

/** Get only single-turn scenarios (for use with runPipeline). */
export function getSingleTurnScenarios(): QualityReviewScenario[] {
  return qualityReviewScenarios.filter(
    (s) =>
      s.input.messages.length === 1 && s.input.messages[0]!.role === "user",
  );
}

/** Get only multi-turn scenarios (for use with runMultiTurnPipeline). */
export function getMultiTurnScenarios(): QualityReviewScenario[] {
  return qualityReviewScenarios.filter(
    (s) =>
      s.input.messages.length > 1 ||
      (s.input.messages.length === 1 && s.input.messages[0]!.role !== "user"),
  );
}
