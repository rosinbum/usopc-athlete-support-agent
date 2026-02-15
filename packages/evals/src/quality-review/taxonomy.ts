/**
 * Failure mode taxonomy for human-in-the-loop quality review.
 *
 * Provides a shared vocabulary for classifying what goes wrong in the agent
 * pipeline. Each failure code is tied to a graph node, has a severity level,
 * and maps to a LangSmith feedback key.
 */

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export type Severity = "critical" | "high" | "medium" | "low";

// ---------------------------------------------------------------------------
// Graph nodes that can fail
// ---------------------------------------------------------------------------

export type FailureNode =
  | "classifier"
  | "retriever"
  | "synthesizer"
  | "citation"
  | "disclaimer"
  | "escalation"
  | "cross-cutting";

// ---------------------------------------------------------------------------
// Failure codes — organized by node
// ---------------------------------------------------------------------------

export interface FailureMode {
  code: string;
  label: string;
  node: FailureNode;
  severity: Severity;
  description: string;
}

export const FAILURE_MODES = {
  // ---- Classifier ----
  CLS_WRONG_DOMAIN: {
    code: "CLS_WRONG_DOMAIN",
    label: "Wrong topic domain",
    node: "classifier",
    severity: "medium",
    description:
      "Classifier assigned the wrong topicDomain, causing retrieval from incorrect document set.",
  },
  CLS_WRONG_INTENT: {
    code: "CLS_WRONG_INTENT",
    label: "Wrong query intent",
    node: "classifier",
    severity: "medium",
    description:
      "Classifier misidentified the query intent (e.g., procedural vs. factual).",
  },
  CLS_MISSED_ESCALATION: {
    code: "CLS_MISSED_ESCALATION",
    label: "Missed escalation signal",
    node: "classifier",
    severity: "critical",
    description:
      "Classifier failed to detect a safety-critical situation requiring escalation.",
  },
  CLS_FALSE_ESCALATION: {
    code: "CLS_FALSE_ESCALATION",
    label: "False escalation",
    node: "classifier",
    severity: "high",
    description:
      "Classifier incorrectly flagged a non-urgent query for escalation.",
  },
  CLS_MISSED_CLARIFICATION: {
    code: "CLS_MISSED_CLARIFICATION",
    label: "Missed clarification need",
    node: "classifier",
    severity: "medium",
    description:
      "Classifier should have requested clarification but proceeded with an ambiguous query.",
  },
  CLS_FALSE_CLARIFICATION: {
    code: "CLS_FALSE_CLARIFICATION",
    label: "Unnecessary clarification",
    node: "classifier",
    severity: "low",
    description:
      "Classifier asked for clarification when the query was clear enough to answer.",
  },
  CLS_MISSED_NGB: {
    code: "CLS_MISSED_NGB",
    label: "Missed NGB detection",
    node: "classifier",
    severity: "medium",
    description:
      "Classifier failed to detect the relevant National Governing Body from the query.",
  },

  // ---- Retriever ----
  RET_IRRELEVANT: {
    code: "RET_IRRELEVANT",
    label: "Retrieved off-topic docs",
    node: "retriever",
    severity: "high",
    description:
      "Retrieved documents are not relevant to the query, leading to poor synthesis.",
  },
  RET_MISSING_SOURCE: {
    code: "RET_MISSING_SOURCE",
    label: "KB lacks content",
    node: "retriever",
    severity: "medium",
    description:
      "The knowledge base does not contain content needed to answer this question.",
  },
  RET_LOW_CONFIDENCE: {
    code: "RET_LOW_CONFIDENCE",
    label: "Low retrieval confidence",
    node: "retriever",
    severity: "medium",
    description:
      "Retriever returned results but with low confidence scores, indicating marginal relevance.",
  },
  RET_WRONG_NGB_DOCS: {
    code: "RET_WRONG_NGB_DOCS",
    label: "Wrong NGB documents",
    node: "retriever",
    severity: "high",
    description:
      "Retrieved documents from the wrong NGB (e.g., USA Swimming docs for a gymnastics question).",
  },
  RET_STALE_CONTENT: {
    code: "RET_STALE_CONTENT",
    label: "Outdated content retrieved",
    node: "retriever",
    severity: "medium",
    description:
      "Retrieved documents contain outdated information (superseded policies, old deadlines).",
  },

  // ---- Synthesizer ----
  SYN_HALLUCINATION: {
    code: "SYN_HALLUCINATION",
    label: "Claims not in context",
    node: "synthesizer",
    severity: "critical",
    description:
      "Answer contains factual claims not supported by retrieved documents or known policy.",
  },
  SYN_INCOMPLETE: {
    code: "SYN_INCOMPLETE",
    label: "Misses key facts",
    node: "synthesizer",
    severity: "high",
    description:
      "Answer omits important facts or steps that are present in the retrieved context.",
  },
  SYN_WRONG_TONE: {
    code: "SYN_WRONG_TONE",
    label: "Tone inappropriate",
    node: "synthesizer",
    severity: "medium",
    description:
      "Answer tone is too formal/informal, dismissive, or insensitive given the query context.",
  },
  SYN_TOO_VERBOSE: {
    code: "SYN_TOO_VERBOSE",
    label: "Much longer than needed",
    node: "synthesizer",
    severity: "low",
    description:
      "Answer is significantly longer than necessary, diluting key information.",
  },
  SYN_TOO_BRIEF: {
    code: "SYN_TOO_BRIEF",
    label: "Too brief",
    node: "synthesizer",
    severity: "medium",
    description:
      "Answer is too short, missing necessary detail or nuance for the question asked.",
  },
  SYN_WRONG_AUDIENCE: {
    code: "SYN_WRONG_AUDIENCE",
    label: "Wrong audience level",
    node: "synthesizer",
    severity: "medium",
    description:
      "Answer uses jargon or assumes knowledge inappropriate for the target audience.",
  },
  SYN_CONTRADICTORY: {
    code: "SYN_CONTRADICTORY",
    label: "Self-contradictory",
    node: "synthesizer",
    severity: "high",
    description: "Answer contains internally contradictory statements.",
  },
  SYN_OUTDATED_INFO: {
    code: "SYN_OUTDATED_INFO",
    label: "Outdated information",
    node: "synthesizer",
    severity: "high",
    description:
      "Answer presents outdated policy, deadlines, or contact info as current.",
  },

  // ---- Citation ----
  CIT_MISSING: {
    code: "CIT_MISSING",
    label: "No citations provided",
    node: "citation",
    severity: "high",
    description:
      "Answer lacks any citations when specific policy or procedure was referenced.",
  },
  CIT_WRONG_SOURCE: {
    code: "CIT_WRONG_SOURCE",
    label: "Citations don't match claims",
    node: "citation",
    severity: "high",
    description:
      "Citations point to documents that don't actually support the claims made.",
  },
  CIT_BROKEN_URL: {
    code: "CIT_BROKEN_URL",
    label: "Broken citation URL",
    node: "citation",
    severity: "medium",
    description:
      "Citation URL is malformed, empty, or points to a non-existent resource.",
  },
  CIT_INSUFFICIENT: {
    code: "CIT_INSUFFICIENT",
    label: "Too few citations",
    node: "citation",
    severity: "medium",
    description:
      "Answer makes multiple distinct claims but only cites a source for some of them.",
  },

  // ---- Disclaimer ----
  DIS_MISSING: {
    code: "DIS_MISSING",
    label: "Missing required disclaimer",
    node: "disclaimer",
    severity: "high",
    description:
      "Answer lacks the required domain-specific disclaimer (e.g., legal, medical, SafeSport).",
  },
  DIS_WRONG_DOMAIN: {
    code: "DIS_WRONG_DOMAIN",
    label: "Wrong disclaimer domain",
    node: "disclaimer",
    severity: "medium",
    description:
      "Disclaimer is present but does not match the topic domain of the answer.",
  },
  DIS_MISSING_SAFETY: {
    code: "DIS_MISSING_SAFETY",
    label: "Missing safety contact info",
    node: "disclaimer",
    severity: "critical",
    description:
      "SafeSport or anti-doping response missing required emergency contact information.",
  },

  // ---- Escalation ----
  ESC_WRONG_TARGET: {
    code: "ESC_WRONG_TARGET",
    label: "Escalated to wrong authority",
    node: "escalation",
    severity: "critical",
    description:
      "Escalation routed to the wrong authority (e.g., SafeSport issue sent to anti-doping).",
  },
  ESC_WRONG_URGENCY: {
    code: "ESC_WRONG_URGENCY",
    label: "Wrong urgency level",
    node: "escalation",
    severity: "high",
    description:
      "Escalation urgency level is incorrect (e.g., immediate marked as standard or vice versa).",
  },
  ESC_MISSING_CONTACT: {
    code: "ESC_MISSING_CONTACT",
    label: "Missing escalation contact",
    node: "escalation",
    severity: "high",
    description:
      "Escalation response missing critical contact information (phone, email, URL).",
  },

  // ---- Cross-cutting ----
  XCT_GENERIC_RESPONSE: {
    code: "XCT_GENERIC_RESPONSE",
    label: "Generic when specific guidance exists",
    node: "cross-cutting",
    severity: "high",
    description:
      "Agent gave a generic/boilerplate answer when specific USOPC guidance exists in the KB.",
  },
  XCT_SCOPE_LEAK: {
    code: "XCT_SCOPE_LEAK",
    label: "Answered out-of-scope question",
    node: "cross-cutting",
    severity: "medium",
    description:
      "Agent attempted to answer a question outside its scope instead of deflecting appropriately.",
  },
  XCT_CONTEXT_LOST: {
    code: "XCT_CONTEXT_LOST",
    label: "Lost conversation context",
    node: "cross-cutting",
    severity: "high",
    description:
      "In multi-turn conversation, agent lost track of context from earlier messages.",
  },
  XCT_WRONG_SPORT: {
    code: "XCT_WRONG_SPORT",
    label: "Applied wrong sport's rules",
    node: "cross-cutting",
    severity: "high",
    description:
      "Agent applied rules or procedures from the wrong sport/NGB to the query.",
  },
  XCT_LATENCY: {
    code: "XCT_LATENCY",
    label: "Unacceptable latency",
    node: "cross-cutting",
    severity: "low",
    description:
      "Response took significantly longer than expected (>30s for a standard query).",
  },
} as const satisfies Record<string, FailureMode>;

export type FailureCode = keyof typeof FAILURE_MODES;

// ---------------------------------------------------------------------------
// LangSmith feedback keys
// ---------------------------------------------------------------------------

/** Feedback keys used in annotation queue scoring. */
export const FEEDBACK_KEYS = {
  /** Overall quality score 1–5 */
  quality: "quality_score",
  /** Helpfulness for an athlete 1–5 */
  helpfulness: "helpfulness_score",
  /** Factual accuracy 1–5 */
  accuracy: "accuracy_score",
  /** Completeness of answer 1–5 */
  completeness: "completeness_score",
  /** Tone appropriateness 1–5 */
  tone: "tone_score",
  /** Comma-separated failure mode codes */
  failureModes: "failure_modes",
  /** Free-text reviewer notes */
  notes: "reviewer_notes",
} as const;

export type FeedbackKey = (typeof FEEDBACK_KEYS)[keyof typeof FEEDBACK_KEYS];

// ---------------------------------------------------------------------------
// Scoring rubric
// ---------------------------------------------------------------------------

export interface RubricLevel {
  score: number;
  label: string;
  description: string;
}

export interface ScoringDimension {
  key: FeedbackKey;
  name: string;
  levels: RubricLevel[];
}

export const SCORING_RUBRIC: ScoringDimension[] = [
  {
    key: FEEDBACK_KEYS.quality,
    name: "Overall Quality",
    levels: [
      {
        score: 1,
        label: "Unusable",
        description:
          "Response is wrong, harmful, or completely misses the question.",
      },
      {
        score: 2,
        label: "Poor",
        description:
          "Response addresses the topic but has significant errors or omissions.",
      },
      {
        score: 3,
        label: "Acceptable",
        description:
          "Response is roughly correct but missing important details or nuance.",
      },
      {
        score: 4,
        label: "Good",
        description:
          "Response is accurate, helpful, and well-structured with minor issues.",
      },
      {
        score: 5,
        label: "Excellent",
        description:
          "Response is accurate, comprehensive, well-cited, and athlete-appropriate.",
      },
    ],
  },
  {
    key: FEEDBACK_KEYS.helpfulness,
    name: "Helpfulness",
    levels: [
      {
        score: 1,
        label: "Not helpful",
        description: "Athlete would get no value from this response.",
      },
      {
        score: 2,
        label: "Slightly helpful",
        description:
          "Points in the right direction but athlete would need significant additional research.",
      },
      {
        score: 3,
        label: "Moderately helpful",
        description:
          "Gives useful information but athlete may need to follow up on specifics.",
      },
      {
        score: 4,
        label: "Very helpful",
        description: "Athlete can act on this with minimal additional effort.",
      },
      {
        score: 5,
        label: "Exceptionally helpful",
        description:
          "Athlete has everything needed to take action, including contacts and next steps.",
      },
    ],
  },
  {
    key: FEEDBACK_KEYS.accuracy,
    name: "Factual Accuracy",
    levels: [
      {
        score: 1,
        label: "Incorrect",
        description: "Contains fabricated or fundamentally wrong information.",
      },
      {
        score: 2,
        label: "Mostly incorrect",
        description: "More wrong than right; key facts are inaccurate.",
      },
      {
        score: 3,
        label: "Mixed",
        description:
          "Core facts are right but some claims are unsupported or wrong.",
      },
      {
        score: 4,
        label: "Mostly accurate",
        description:
          "Facts are correct with only minor inaccuracies or imprecisions.",
      },
      {
        score: 5,
        label: "Fully accurate",
        description:
          "All claims are supported by source documents or known policy.",
      },
    ],
  },
  {
    key: FEEDBACK_KEYS.completeness,
    name: "Completeness",
    levels: [
      {
        score: 1,
        label: "Incomplete",
        description: "Misses the core of what was asked.",
      },
      {
        score: 2,
        label: "Partial",
        description: "Addresses part of the question but skips major aspects.",
      },
      {
        score: 3,
        label: "Adequate",
        description: "Covers the main point but misses supporting details.",
      },
      {
        score: 4,
        label: "Thorough",
        description: "Covers the question well with only minor gaps.",
      },
      {
        score: 5,
        label: "Comprehensive",
        description:
          "Fully addresses all aspects of the question with appropriate depth.",
      },
    ],
  },
  {
    key: FEEDBACK_KEYS.tone,
    name: "Tone",
    levels: [
      {
        score: 1,
        label: "Inappropriate",
        description:
          "Dismissive, condescending, or insensitive to the athlete's situation.",
      },
      {
        score: 2,
        label: "Off-putting",
        description:
          "Too robotic, overly formal, or fails to acknowledge emotional context.",
      },
      {
        score: 3,
        label: "Neutral",
        description:
          "Professional but lacks warmth or empathy where appropriate.",
      },
      {
        score: 4,
        label: "Good",
        description:
          "Professional, empathetic, and appropriate for the context.",
      },
      {
        score: 5,
        label: "Excellent",
        description:
          "Perfectly calibrated tone — supportive, clear, and athlete-centered.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all failure modes for a specific node. */
export function getFailuresByNode(node: FailureNode): FailureMode[] {
  return Object.values(FAILURE_MODES).filter((fm) => fm.node === node);
}

/** Get all failure modes at a given severity. */
export function getFailuresBySeverity(severity: Severity): FailureMode[] {
  return Object.values(FAILURE_MODES).filter((fm) => fm.severity === severity);
}

/** Parse a comma-separated failure codes string into validated codes. */
export function parseFailureCodes(raw: string): FailureCode[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is FailureCode => s in FAILURE_MODES);
}
