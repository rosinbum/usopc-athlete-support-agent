import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("pg", () => {
  const mockPool = {
    totalCount: 3,
    idleCount: 2,
    waitingCount: 0,
    end: vi.fn(),
    on: vi.fn(),
  };
  return { Pool: vi.fn(() => mockPool) };
});

vi.mock("./env.js", () => ({
  getDatabaseUrl: vi.fn(() => "postgres://localhost/test"),
}));

vi.mock("./logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { Pool } from "pg";
import { getPool, closePool, getPoolStatus } from "./pool.js";
import { getDatabaseUrl } from "./env.js";
import { logger } from "./logger.js";

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

  describe("pool size (PERF-1)", () => {
    it("creates pool with max 10 connections", () => {
      getPool();
      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({ max: 10 }),
      );
    });
  });

  describe("pool error handler (SEC-1)", () => {
    it("registers an error handler on pool creation", () => {
      getPool();
      const mockPool = MockPool.mock.results[0]?.value;
      expect(mockPool.on).toHaveBeenCalledWith("error", expect.any(Function));
    });

    it("logs error without crashing when idle connection fails", () => {
      getPool();
      const mockPool = MockPool.mock.results[0]?.value;
      const errorHandler = (
        mockPool.on.mock.calls as [string, (err: Error) => void][]
      ).find((c) => c[0] === "error")?.[1];

      expect(errorHandler).toBeDefined();
      // Should not throw
      errorHandler!(new Error("connection reset by peer"));

      expect(logger.error).toHaveBeenCalledWith(
        "Idle pool connection error (non-fatal)",
        expect.objectContaining({ message: "connection reset by peer" }),
      );
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
