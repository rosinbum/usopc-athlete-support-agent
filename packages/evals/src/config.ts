import { Client } from "langsmith";

/** LangSmith project name for all eval experiments. */
export const LANGSMITH_PROJECT = "usopc-evals";

/** Dataset names — must match what seed-langsmith.ts creates. */
export const DATASET_NAMES = {
  classifier: "usopc-classifier",
  retrieval: "usopc-retrieval",
  answerQuality: "usopc-answer-quality",
  escalation: "usopc-escalation",
  trajectory: "usopc-trajectory",
} as const;

let _client: Client | undefined;

/** Returns a shared LangSmith client instance. */
export function getLangSmithClient(): Client {
  if (!_client) {
    _client = new Client();
  }
  return _client;
}
