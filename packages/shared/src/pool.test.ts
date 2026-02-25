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

import { Pool } from "pg";
import { getPool, closePool, getPoolStatus } from "./pool.js";
import { getDatabaseUrl } from "./env.js";

const MockPool = vi.mocked(Pool);
const mockGetDatabaseUrl = vi.mocked(getDatabaseUrl);

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

  describe("SSL configuration (SEC-01)", () => {
    it("enables SSL with default CA validation for Neon connections", () => {
      mockGetDatabaseUrl.mockReturnValue(
        "postgres://user:pass@ep-example.us-east-1.aws.neon.tech/db",
      );
      getPool();
      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({ ssl: true }),
      );
    });

    it("does not set rejectUnauthorized: false", () => {
      mockGetDatabaseUrl.mockReturnValue(
        "postgres://user:pass@ep-example.us-east-1.aws.neon.tech/db",
      );
      getPool();
      const poolConfig = MockPool.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(poolConfig.ssl).toBe(true);
      expect(poolConfig.ssl).not.toEqual(
        expect.objectContaining({ rejectUnauthorized: false }),
      );
    });

    it("skips SSL for non-Neon local connections", () => {
      mockGetDatabaseUrl.mockReturnValue("postgres://localhost/test");
      getPool();
      const poolConfig = MockPool.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(poolConfig.ssl).toBeUndefined();
    });
  });
});
