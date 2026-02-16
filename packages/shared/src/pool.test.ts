import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("pg", () => {
  const mockPool = {
    totalCount: 3,
    idleCount: 2,
    waitingCount: 0,
    end: vi.fn(),
  };
  return { Pool: vi.fn(() => mockPool) };
});

vi.mock("./env.js", () => ({
  getDatabaseUrl: vi.fn(() => "postgres://localhost/test"),
}));

import { getPool, closePool, getPoolStatus } from "./pool.js";

describe("pool", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await closePool();
  });

  describe("getPoolStatus", () => {
    it("returns null before pool is created", () => {
      expect(getPoolStatus()).toBeNull();
    });

    it("returns correct shape after getPool() is called", () => {
      getPool();
      const status = getPoolStatus();
      expect(status).toEqual({
        totalConnections: 3,
        idleConnections: 2,
        waitingRequests: 0,
      });
    });
  });
});
