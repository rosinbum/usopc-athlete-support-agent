import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockGetDatabaseUrl, mockGetSecretValue, mockGetOptionalEnv } =
  vi.hoisted(() => ({
    mockGetDatabaseUrl: vi.fn().mockReturnValue("postgresql://localhost/test"),
    mockGetSecretValue: vi.fn().mockReturnValue("fake-key"),
    mockGetOptionalEnv: vi.fn().mockReturnValue(undefined),
  }));

const { mockCreateConversationSummaryEntity } = vi.hoisted(() => ({
  mockCreateConversationSummaryEntity: vi
    .fn()
    .mockReturnValue({ get: vi.fn(), upsert: vi.fn() }),
}));

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    getDatabaseUrl: mockGetDatabaseUrl,
    getSecretValue: mockGetSecretValue,
    getOptionalEnv: mockGetOptionalEnv,
    createConversationSummaryEntity: mockCreateConversationSummaryEntity,
    logger: {
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
  };
});

const { mockAgentRunnerCreate } = vi.hoisted(() => ({
  mockAgentRunnerCreate: vi.fn(),
}));

vi.mock("./runner.js", () => ({
  AgentRunner: { create: mockAgentRunnerCreate },
}));

vi.mock("../services/conversationMemory.js", () => ({
  setSummaryStore: vi.fn(),
}));

vi.mock("../services/dynamoSummaryStore.js", () => ({
  DynamoSummaryStore: vi.fn(),
}));

import { getAppRunner, resetAppRunner } from "./runnerFactory.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runnerFactory", () => {
  const fakeRunner = { invoke: vi.fn(), stream: vi.fn(), close: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    resetAppRunner();
    mockAgentRunnerCreate.mockResolvedValue(fakeRunner);
  });

  it("returns the same promise on concurrent calls (caching)", async () => {
    const p1 = getAppRunner();
    const p2 = getAppRunner();

    expect(p1).toBe(p2);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(mockAgentRunnerCreate).toHaveBeenCalledOnce();
  });

  it("clears cache on initialization failure (error recovery)", async () => {
    mockAgentRunnerCreate.mockRejectedValueOnce(new Error("init failed"));

    await expect(getAppRunner()).rejects.toThrow("init failed");

    // Next call should retry
    mockAgentRunnerCreate.mockResolvedValueOnce(fakeRunner);
    const runner = await getAppRunner();
    expect(runner).toBe(fakeRunner);
    expect(mockAgentRunnerCreate).toHaveBeenCalledTimes(2);
  });

  it("resetAppRunner() forces re-initialization", async () => {
    await getAppRunner();
    expect(mockAgentRunnerCreate).toHaveBeenCalledOnce();

    resetAppRunner();
    await getAppRunner();
    expect(mockAgentRunnerCreate).toHaveBeenCalledTimes(2);
  });

  it("passes database URL and API keys to AgentRunner.create", async () => {
    mockGetDatabaseUrl.mockReturnValue("postgresql://prod/db");
    mockGetSecretValue.mockImplementation((envKey: string) => {
      const map: Record<string, string> = {
        ANTHROPIC_API_KEY: "anthropic-key",
        OPENAI_API_KEY: "openai-key",
        TAVILY_API_KEY: "tavily-key",
      };
      return map[envKey] ?? "default-key";
    });

    await getAppRunner();

    expect(mockAgentRunnerCreate).toHaveBeenCalledWith({
      databaseUrl: "postgresql://prod/db",
      openaiApiKey: "openai-key",
      tavilyApiKey: "tavily-key",
    });
  });
});
