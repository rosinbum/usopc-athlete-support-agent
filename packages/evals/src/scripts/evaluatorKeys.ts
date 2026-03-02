/** Evaluator key groups — single source of truth for baseline and reporting. */
export const EVALUATOR_GROUPS: Array<{ label: string; keys: string[] }> = [
  {
    label: "Classifier",
    keys: [
      "topic_domain_accuracy",
      "query_intent_accuracy",
      "ngb_detection_jaccard",
      "escalation_accuracy",
      "clarification_accuracy",
    ],
  },
  {
    label: "Escalation",
    keys: [
      "route_correct",
      "target_correct",
      "urgency_correct",
      "contact_info_present",
    ],
  },
  {
    label: "Trajectory",
    keys: [
      "trajectory_strict_match",
      "trajectory_subset_match",
      "path_type_correct",
    ],
  },
  {
    label: "Disclaimers",
    keys: [
      "disclaimer_present",
      "disclaimer_correct_domain",
      "disclaimer_safety_info",
    ],
  },
  {
    label: "Citations",
    keys: [
      "citations_present",
      "citations_have_urls",
      "citations_have_snippets",
    ],
  },
  {
    label: "Correctness",
    keys: ["correctness", "conciseness"],
  },
  {
    label: "Groundedness",
    keys: ["groundedness"],
  },
  {
    label: "Semantic Similarity",
    keys: ["semantic_similarity"],
  },
];

/** Flat list of all feedback keys — derived from EVALUATOR_GROUPS. */
export const FEEDBACK_KEYS = EVALUATOR_GROUPS.flatMap((g) => g.keys);
