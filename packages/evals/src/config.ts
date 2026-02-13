import { Client } from "langsmith";

/** LangSmith project name for all eval experiments. */
export const LANGSMITH_PROJECT = "usopc-evals";

/** Dataset names — must match what seed-datasets.ts creates. */
export const DATASET_NAMES = {
  classifier: "usopc-classifier",
  retrieval: "usopc-retrieval",
  answerQuality: "usopc-answer-quality",
  escalation: "usopc-escalation",
  trajectory: "usopc-trajectory",
} as const;

/** Suite names that map to evaluator modules. */
export const SUITE_NAMES = [
  "classifier",
  "groundedness",
  "correctness",
  "escalation",
  "trajectory",
  "citations",
  "disclaimers",
] as const;

export type SuiteName = (typeof SUITE_NAMES)[number];

let _client: Client | undefined;

/** Returns a shared LangSmith client instance. */
export function getLangSmithClient(): Client {
  if (!_client) {
    _client = new Client();
  }
  return _client;
}
