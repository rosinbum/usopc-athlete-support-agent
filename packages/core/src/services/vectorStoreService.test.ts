import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
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

import {
  vectorStoreRead,
  vectorStoreSearch,
  vectorStoreWrite,
  getVectorStoreReadCircuitMetrics,
  getVectorStoreWriteCircuitMetrics,
  resetVectorStoreReadCircuit,
  resetVectorStoreWriteCircuit,
} from "./vectorStoreService.js";
import { CircuitBreakerError } from "@usopc/shared";

describe("vectorStoreService", () => {
  beforeEach(() => {
    resetVectorStoreReadCircuit();
    resetVectorStoreWriteCircuit();
  });

  describe("vectorStoreRead", () => {
    it("passes through and returns the result of the operation", async () => {
      const rows = [{ id: 1 }];
      const result = await vectorStoreRead(() => Promise.resolve(rows));
      expect(result).toEqual(rows);
    });

    it("propagates errors from the underlying operation", async () => {
      await expect(
        vectorStoreRead(() => Promise.reject(new Error("DB error"))),
      ).rejects.toThrow("DB error");
    });

    it("opens the read circuit after 5 consecutive failures", async () => {
      const fail = () => Promise.reject(new Error("DB error"));
      for (let i = 0; i < 5; i++) {
        await expect(vectorStoreRead(fail)).rejects.toThrow("DB error");
      }
      expect(getVectorStoreReadCircuitMetrics().state).toBe("open");
    });

    it("throws CircuitBreakerError when read circuit is open", async () => {
      const fail = () => Promise.reject(new Error("DB error"));
      for (let i = 0; i < 5; i++) {
        await expect(vectorStoreRead(fail)).rejects.toThrow();
      }

      await expect(vectorStoreRead(() => Promise.resolve([]))).rejects.toThrow(
        CircuitBreakerError,
      );
    });

    it("does not affect the write circuit when read circuit opens", async () => {
      const fail = () => Promise.reject(new Error("DB error"));
      for (let i = 0; i < 5; i++) {
        await expect(vectorStoreRead(fail)).rejects.toThrow();
      }

      expect(getVectorStoreReadCircuitMetrics().state).toBe("open");
      expect(getVectorStoreWriteCircuitMetrics().state).toBe("closed");
    });
  });

  describe("vectorStoreSearch", () => {
    it("returns search results on success", async () => {
      const rows = [{ id: 1, score: 0.9 }];
      const result = await vectorStoreSearch(() => Promise.resolve(rows), []);
      expect(result).toEqual(rows);
    });

    it("returns fallback when operation fails", async () => {
      const result = await vectorStoreSearch(
        () => Promise.reject(new Error("timeout")),
        [],
      );
      expect(result).toEqual([]);
    });

    it("returns fallback when read circuit is open", async () => {
      const fail = () => Promise.reject(new Error("DB error"));
      for (let i = 0; i < 5; i++) {
        await expect(vectorStoreRead(fail)).rejects.toThrow();
      }

      const result = await vectorStoreSearch(
        () => Promise.resolve([{ id: 99 }]),
        [],
      );
      expect(result).toEqual([]);
    });
  });

  describe("vectorStoreWrite", () => {
    it("passes through and returns the result of the operation", async () => {
      const result = await vectorStoreWrite(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it("propagates errors from the underlying operation", async () => {
      await expect(
        vectorStoreWrite(() => Promise.reject(new Error("Write error"))),
      ).rejects.toThrow("Write error");
    });

    it("opens the write circuit after 3 consecutive failures", async () => {
      const fail = () => Promise.reject(new Error("Write error"));
      for (let i = 0; i < 3; i++) {
        await expect(vectorStoreWrite(fail)).rejects.toThrow("Write error");
      }
      expect(getVectorStoreWriteCircuitMetrics().state).toBe("open");
    });

    it("throws CircuitBreakerError when write circuit is open", async () => {
      const fail = () => Promise.reject(new Error("Write error"));
      for (let i = 0; i < 3; i++) {
        await expect(vectorStoreWrite(fail)).rejects.toThrow();
      }

      await expect(
        vectorStoreWrite(() => Promise.resolve(undefined)),
      ).rejects.toThrow(CircuitBreakerError);
    });

    it("does not affect the read circuit when write circuit opens", async () => {
      const fail = () => Promise.reject(new Error("Write error"));
      for (let i = 0; i < 3; i++) {
        await expect(vectorStoreWrite(fail)).rejects.toThrow();
      }

      expect(getVectorStoreWriteCircuitMetrics().state).toBe("open");
      expect(getVectorStoreReadCircuitMetrics().state).toBe("closed");
    });
  });

  describe("getVectorStoreReadCircuitMetrics", () => {
    it("returns closed state initially", () => {
      expect(getVectorStoreReadCircuitMetrics().state).toBe("closed");
    });

    it("tracks failures correctly", async () => {
      const fail = () => Promise.reject(new Error("DB error"));
      await expect(vectorStoreRead(fail)).rejects.toThrow();
      await expect(vectorStoreRead(fail)).rejects.toThrow();

      // consecutiveFailures is reset by resetVectorStoreReadCircuit(); totalFailures
      // is a lifetime counter that persists across resets (module-level singleton)
      const metrics = getVectorStoreReadCircuitMetrics();
      expect(metrics.consecutiveFailures).toBe(2);
    });
  });

  describe("getVectorStoreWriteCircuitMetrics", () => {
    it("returns closed state initially", () => {
      expect(getVectorStoreWriteCircuitMetrics().state).toBe("closed");
    });
  });

  describe("resetVectorStoreReadCircuit", () => {
    it("resets an open read circuit to closed", async () => {
      const fail = () => Promise.reject(new Error("DB error"));
      for (let i = 0; i < 5; i++) {
        await expect(vectorStoreRead(fail)).rejects.toThrow();
      }
      expect(getVectorStoreReadCircuitMetrics().state).toBe("open");

      resetVectorStoreReadCircuit();

      expect(getVectorStoreReadCircuitMetrics().state).toBe("closed");
    });
  });

  describe("resetVectorStoreWriteCircuit", () => {
    it("resets an open write circuit to closed", async () => {
      const fail = () => Promise.reject(new Error("Write error"));
      for (let i = 0; i < 3; i++) {
        await expect(vectorStoreWrite(fail)).rejects.toThrow();
      }
      expect(getVectorStoreWriteCircuitMetrics().state).toBe("open");

      resetVectorStoreWriteCircuit();

      expect(getVectorStoreWriteCircuitMetrics().state).toBe("closed");
    });
  });
});
