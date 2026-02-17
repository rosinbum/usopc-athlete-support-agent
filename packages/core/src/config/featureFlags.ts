export interface FeatureFlags {
  qualityChecker: boolean;
  conversationMemory: boolean;
  sourceDiscovery: boolean;
  multiStepPlanner: boolean;
  feedbackLoop: boolean;
  retrievalExpansion: boolean;
  queryPlanner: boolean;
  emotionalSupport: boolean;
  parallelResearch: boolean;
}

/**
 * Reads feature flags from environment variables.
 * All flags default to `false` — only the string "true" enables a flag.
 *
 * These flags are set via the `environment` block in sst.config.ts and baked
 * into the Lambda configuration at deploy time. Changing a flag value requires
 * a redeployment — they are not runtime-configurable.
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    qualityChecker: process.env.FEATURE_QUALITY_CHECKER === "true",
    conversationMemory: process.env.FEATURE_CONVERSATION_MEMORY === "true",
    sourceDiscovery: process.env.FEATURE_SOURCE_DISCOVERY === "true",
    multiStepPlanner: process.env.FEATURE_MULTI_STEP_PLANNER === "true",
    feedbackLoop: process.env.FEATURE_FEEDBACK_LOOP === "true",
    retrievalExpansion: process.env.FEATURE_RETRIEVAL_EXPANSION === "true",
    queryPlanner: process.env.FEATURE_QUERY_PLANNER === "true",
    emotionalSupport: process.env.FEATURE_EMOTIONAL_SUPPORT === "true",
    parallelResearch: process.env.FEATURE_PARALLEL_RESEARCH !== "false",
  };
}
