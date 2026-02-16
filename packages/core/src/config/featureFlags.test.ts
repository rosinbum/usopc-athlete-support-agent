import { describe, it, expect, beforeEach } from "vitest";
import { getFeatureFlags } from "./featureFlags.js";

const FLAG_ENV_VARS = [
  "FEATURE_QUALITY_CHECKER",
  "FEATURE_CONVERSATION_MEMORY",
  "FEATURE_SOURCE_DISCOVERY",
  "FEATURE_MULTI_STEP_PLANNER",
  "FEATURE_FEEDBACK_LOOP",
  "FEATURE_QUERY_PLANNER",
  "FEATURE_EMOTIONAL_SUPPORT",
] as const;

describe("getFeatureFlags", () => {
  beforeEach(() => {
    for (const key of FLAG_ENV_VARS) {
      delete process.env[key];
    }
  });

  it("defaults all flags to false when no env vars are set", () => {
    const flags = getFeatureFlags();

    expect(flags.qualityChecker).toBe(false);
    expect(flags.conversationMemory).toBe(false);
    expect(flags.sourceDiscovery).toBe(false);
    expect(flags.multiStepPlanner).toBe(false);
    expect(flags.feedbackLoop).toBe(false);
    expect(flags.queryPlanner).toBe(false);
    expect(flags.emotionalSupport).toBe(false);
  });

  it.each([
    ["FEATURE_QUALITY_CHECKER", "qualityChecker"],
    ["FEATURE_CONVERSATION_MEMORY", "conversationMemory"],
    ["FEATURE_SOURCE_DISCOVERY", "sourceDiscovery"],
    ["FEATURE_MULTI_STEP_PLANNER", "multiStepPlanner"],
    ["FEATURE_FEEDBACK_LOOP", "feedbackLoop"],
    ["FEATURE_QUERY_PLANNER", "queryPlanner"],
    ["FEATURE_EMOTIONAL_SUPPORT", "emotionalSupport"],
  ] as const)("%s enables %s", (envVar, flagKey) => {
    process.env[envVar] = "true";
    const flags = getFeatureFlags();
    expect(flags[flagKey]).toBe(true);
  });

  it("only enables the flag that is set, others remain false", () => {
    process.env.FEATURE_QUALITY_CHECKER = "true";
    const flags = getFeatureFlags();

    expect(flags.qualityChecker).toBe(true);
    expect(flags.conversationMemory).toBe(false);
    expect(flags.sourceDiscovery).toBe(false);
    expect(flags.multiStepPlanner).toBe(false);
    expect(flags.feedbackLoop).toBe(false);
    expect(flags.queryPlanner).toBe(false);
    expect(flags.emotionalSupport).toBe(false);
  });

  it.each(["false", "", "1", "TRUE", "yes", "on"])(
    "treats %j as false (only exact 'true' enables)",
    (value) => {
      process.env.FEATURE_QUALITY_CHECKER = value;
      const flags = getFeatureFlags();
      expect(flags.qualityChecker).toBe(false);
    },
  );

  it("enables multiple flags simultaneously", () => {
    process.env.FEATURE_QUALITY_CHECKER = "true";
    process.env.FEATURE_FEEDBACK_LOOP = "true";
    const flags = getFeatureFlags();

    expect(flags.qualityChecker).toBe(true);
    expect(flags.feedbackLoop).toBe(true);
    expect(flags.conversationMemory).toBe(false);
  });
});
