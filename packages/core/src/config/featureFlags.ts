export interface FeatureFlags {
  qualityChecker: boolean;
  conversationMemory: boolean;
  sourceDiscovery: boolean;
  multiStepPlanner: boolean;
  feedbackLoop: boolean;
}

/**
 * Reads feature flags from environment variables.
 * All flags default to `false` — only the string "true" enables a flag.
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    qualityChecker: process.env.FEATURE_QUALITY_CHECKER === "true",
    conversationMemory: process.env.FEATURE_CONVERSATION_MEMORY === "true",
    sourceDiscovery: process.env.FEATURE_SOURCE_DISCOVERY === "true",
    multiStepPlanner: process.env.FEATURE_MULTI_STEP_PLANNER === "true",
    feedbackLoop: process.env.FEATURE_FEEDBACK_LOOP === "true",
  };
}
