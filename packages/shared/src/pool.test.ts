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
import { getPool, closePool, getPoolStatus, needsSsl } from "./pool.js";
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

  describe("SSL configuration (SEC-2)", () => {
    it("enables SSL for remote host", () => {
      mockGetDatabaseUrl.mockReturnValue(
        "postgres://user:pass@ep-example.us-east-1.aws.neon.tech/db",
      );
      getPool();
      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({ ssl: true }),
      );
    });

    it("enables SSL for any non-local host", () => {
      mockGetDatabaseUrl.mockReturnValue(
        "postgres://user:pass@my-rds-instance.amazonaws.com/db",
      );
      getPool();
      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({ ssl: true }),
      );
    });

    it("skips SSL for localhost", () => {
      mockGetDatabaseUrl.mockReturnValue("postgres://localhost/test");
      getPool();
      const poolConfig = MockPool.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(poolConfig.ssl).toBeUndefined();
    });

    it("skips SSL for 127.0.0.1", () => {
      mockGetDatabaseUrl.mockReturnValue("postgres://127.0.0.1/test");
      getPool();
      const poolConfig = MockPool.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(poolConfig.ssl).toBeUndefined();
    });
  });

  describe("needsSsl", () => {
    it("returns true for remote hosts", () => {
      expect(needsSsl("postgres://user:pass@db.neon.tech/mydb")).toBe(true);
      expect(needsSsl("postgres://user:pass@rds.amazonaws.com/mydb")).toBe(
        true,
      );
    });

    it("returns false for localhost", () => {
      expect(needsSsl("postgres://localhost/test")).toBe(false);
      expect(needsSsl("postgres://localhost:5432/test")).toBe(false);
    });

    it("returns false for 127.0.0.1", () => {
      expect(needsSsl("postgres://127.0.0.1/test")).toBe(false);
    });

    it("returns false for ::1", () => {
      expect(needsSsl("postgres://[::1]/test")).toBe(false);
    });

    it("respects sslmode=require", () => {
      expect(needsSsl("postgres://localhost/test?sslmode=require")).toBe(true);
    });

    it("respects sslmode=verify-full", () => {
      expect(needsSsl("postgres://localhost/test?sslmode=verify-full")).toBe(
        true,
      );
    });

    it("respects sslmode=disable", () => {
      expect(needsSsl("postgres://remote.host.com/db?sslmode=disable")).toBe(
        false,
      );
    });

    it("returns true for unparseable URLs (safe default)", () => {
      expect(needsSsl("not-a-url")).toBe(true);
    });
  });
});
