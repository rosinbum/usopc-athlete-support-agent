import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CircuitBreakerMetrics } from "@usopc/shared";

const closedMetrics: CircuitBreakerMetrics = {
  state: "closed",
  failures: 0,
  consecutiveFailures: 0,
  totalRequests: 10,
  totalFailures: 0,
  totalTimeouts: 0,
  totalRejections: 0,
  lastFailureTime: null,
};

const openMetrics: CircuitBreakerMetrics = {
  ...closedMetrics,
  state: "open",
  failures: 5,
  consecutiveFailures: 5,
  totalFailures: 5,
};

vi.mock("../db/client.js", () => ({
  getPool: vi.fn(() => ({})),
  getPoolStatus: vi.fn(() => ({
    totalConnections: 3,
    idleConnections: 2,
    waitingRequests: 0,
  })),
}));

vi.mock("@usopc/core", () => ({
  getLlmCircuitMetrics: vi.fn(() => closedMetrics),
  getEmbeddingsCircuitMetrics: vi.fn(() => closedMetrics),
  getTavilyCircuitMetrics: vi.fn(() => closedMetrics),
  getVectorStoreReadCircuitMetrics: vi.fn(() => closedMetrics),
  getVectorStoreWriteCircuitMetrics: vi.fn(() => closedMetrics),
}));

import { healthRouter } from "./health.js";
import { createContext } from "../trpc.js";
import { getLlmCircuitMetrics, getTavilyCircuitMetrics } from "@usopc/core";

const createCaller = () => {
  const ctx = createContext();
  return healthRouter.createCaller(ctx);
};

describe("healthRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when all circuits are closed", async () => {
    const caller = createCaller();
    const result = await caller.check();

    expect(result.status).toBe("ok");
    expect(result.version).toBe("0.0.1");
    expect(result.timestamp).toBeDefined();
    expect(result.pool).toEqual({
      totalConnections: 3,
      idleConnections: 2,
      waitingRequests: 0,
    });
    expect(result.circuits.llm.state).toBe("closed");
  });

  it("returns degraded when any circuit is open", async () => {
    vi.mocked(getLlmCircuitMetrics).mockReturnValueOnce(openMetrics);

    const caller = createCaller();
    const result = await caller.check();

    expect(result.status).toBe("degraded");
    expect(result.circuits.llm.state).toBe("open");
  });

  it("returns degraded when a non-llm circuit is open", async () => {
    vi.mocked(getTavilyCircuitMetrics).mockReturnValueOnce(openMetrics);

    const caller = createCaller();
    const result = await caller.check();

    expect(result.status).toBe("degraded");
  });
});
