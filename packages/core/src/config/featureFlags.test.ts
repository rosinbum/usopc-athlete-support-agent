import { describe, it, expect, beforeEach } from "vitest";
import { getFeatureFlags } from "./featureFlags.js";

const FLAG_ENV_VARS = [
  "FEATURE_QUALITY_CHECKER",
  "FEATURE_CONVERSATION_MEMORY",
  "FEATURE_SOURCE_DISCOVERY",
  "FEATURE_MULTI_STEP_PLANNER",
  "FEATURE_FEEDBACK_LOOP",
  "FEATURE_QUERY_PLANNER",
] as const;

describe("getFeatureFlags", () => {
  beforeEach(() => {
    for (const key of FLAG_ENV_VARS) {
      delete process.env[key];
    }
  });

  it("defaults all flags to true when no env vars are set", () => {
    const flags = getFeatureFlags();

    expect(flags.qualityChecker).toBe(true);
    expect(flags.conversationMemory).toBe(true);
    expect(flags.sourceDiscovery).toBe(true);
    expect(flags.multiStepPlanner).toBe(true);
    expect(flags.feedbackLoop).toBe(true);
    expect(flags.queryPlanner).toBe(true);
  });

  it.each([
    ["FEATURE_QUALITY_CHECKER", "qualityChecker"],
    ["FEATURE_CONVERSATION_MEMORY", "conversationMemory"],
    ["FEATURE_SOURCE_DISCOVERY", "sourceDiscovery"],
    ["FEATURE_MULTI_STEP_PLANNER", "multiStepPlanner"],
    ["FEATURE_FEEDBACK_LOOP", "feedbackLoop"],
    ["FEATURE_QUERY_PLANNER", "queryPlanner"],
  ] as const)("%s disables %s when set to 'false'", (envVar, flagKey) => {
    process.env[envVar] = "false";
    const flags = getFeatureFlags();
    expect(flags[flagKey]).toBe(false);
  });

  it("only disables the flag that is set to 'false', others remain true", () => {
    process.env.FEATURE_QUALITY_CHECKER = "false";
    const flags = getFeatureFlags();

    expect(flags.qualityChecker).toBe(false);
    expect(flags.conversationMemory).toBe(true);
    expect(flags.sourceDiscovery).toBe(true);
    expect(flags.multiStepPlanner).toBe(true);
    expect(flags.feedbackLoop).toBe(true);
    expect(flags.queryPlanner).toBe(true);
  });

  it.each(["true", "", "1", "FALSE", "yes", "on"])(
    "treats %j as true (only exact 'false' disables)",
    (value) => {
      process.env.FEATURE_QUALITY_CHECKER = value;
      const flags = getFeatureFlags();
      expect(flags.qualityChecker).toBe(true);
    },
  );

  it("disables multiple flags simultaneously", () => {
    process.env.FEATURE_QUALITY_CHECKER = "false";
    process.env.FEATURE_FEEDBACK_LOOP = "false";
    const flags = getFeatureFlags();

    expect(flags.qualityChecker).toBe(false);
    expect(flags.feedbackLoop).toBe(false);
    expect(flags.conversationMemory).toBe(true);
  });
});
