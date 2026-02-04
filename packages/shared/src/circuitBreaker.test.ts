import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerError,
  type CircuitBreakerConfig,
} from "./circuitBreaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createCircuitBreaker(
    overrides: Partial<CircuitBreakerConfig> = {},
  ): CircuitBreaker {
    return new CircuitBreaker({
      name: "test-circuit",
      failureThreshold: 3,
      resetTimeout: 1000,
      requestTimeout: 100,
      successThreshold: 2,
      ...overrides,
    });
  }

  describe("CLOSED state", () => {
    it("allows requests to pass through", async () => {
      const circuit = createCircuitBreaker();
      const result = await circuit.execute(async () => "success");
      expect(result).toBe("success");
      expect(circuit.getState()).toBe("closed");
    });

    it("tracks failures without opening circuit below threshold", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 3 });

      // Fail twice (below threshold)
      for (let i = 0; i < 2; i++) {
        await expect(
          circuit.execute(async () => {
            throw new Error("fail");
          }),
        ).rejects.toThrow("fail");
      }

      expect(circuit.getState()).toBe("closed");
      expect(circuit.getMetrics().consecutiveFailures).toBe(2);
    });

    it("opens circuit after reaching failure threshold", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 3 });

      // Fail 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(
          circuit.execute(async () => {
            throw new Error("fail");
          }),
        ).rejects.toThrow("fail");
      }

      expect(circuit.getState()).toBe("open");
    });

    it("resets failure count on success", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 3 });

      // Fail twice
      for (let i = 0; i < 2; i++) {
        await expect(
          circuit.execute(async () => {
            throw new Error("fail");
          }),
        ).rejects.toThrow("fail");
      }

      // Succeed
      await circuit.execute(async () => "success");

      expect(circuit.getMetrics().consecutiveFailures).toBe(0);
    });
  });

  describe("OPEN state", () => {
    it("rejects requests immediately with CircuitBreakerError", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 1 });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow("fail");

      expect(circuit.getState()).toBe("open");

      // Subsequent requests should be rejected
      await expect(circuit.execute(async () => "success")).rejects.toThrow(
        CircuitBreakerError,
      );
    });

    it("transitions to half-open after reset timeout", async () => {
      const circuit = createCircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 1000,
      });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow("fail");

      expect(circuit.getState()).toBe("open");

      // Advance time past reset timeout
      vi.advanceTimersByTime(1001);

      expect(circuit.getState()).toBe("half-open");
    });

    it("increments totalRejections when rejecting requests", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 1 });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      // Attempt requests while open
      await expect(circuit.execute(async () => "success")).rejects.toThrow(
        CircuitBreakerError,
      );
      await expect(circuit.execute(async () => "success")).rejects.toThrow(
        CircuitBreakerError,
      );

      expect(circuit.getMetrics().totalRejections).toBe(2);
    });
  });

  describe("HALF-OPEN state", () => {
    it("allows limited requests through", async () => {
      const circuit = createCircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 1000,
      });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      // Advance to half-open
      vi.advanceTimersByTime(1001);
      expect(circuit.getState()).toBe("half-open");

      // Request should pass through
      const result = await circuit.execute(async () => "success");
      expect(result).toBe("success");
    });

    it("closes after success threshold is met", async () => {
      const circuit = createCircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 1000,
        successThreshold: 2,
      });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      // Advance to half-open
      vi.advanceTimersByTime(1001);

      // Success #1
      await circuit.execute(async () => "success");
      expect(circuit.getState()).toBe("half-open");

      // Success #2 should close
      await circuit.execute(async () => "success");
      expect(circuit.getState()).toBe("closed");
    });

    it("reopens on any failure", async () => {
      const circuit = createCircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 1000,
      });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      // Advance to half-open
      vi.advanceTimersByTime(1001);
      expect(circuit.getState()).toBe("half-open");

      // Fail again
      await expect(
        circuit.execute(async () => {
          throw new Error("fail again");
        }),
      ).rejects.toThrow();

      expect(circuit.getState()).toBe("open");
    });
  });

  describe("timeout handling", () => {
    it("treats timeout as a failure", async () => {
      // Use real timers for actual timeout testing
      vi.useRealTimers();

      const circuit = createCircuitBreaker({
        failureThreshold: 1,
        requestTimeout: 20, // Very short timeout
      });

      // Execute a function that never resolves (simulates a hung request)
      await expect(
        circuit.execute(() => new Promise(() => {})),
      ).rejects.toThrow(/timeout/i);

      expect(circuit.getState()).toBe("open");
      expect(circuit.getMetrics().totalTimeouts).toBe(1);

      // Restore fake timers for other tests
      vi.useFakeTimers();
    });

    it("increments totalTimeouts counter", async () => {
      // Use real timers for actual timeout testing
      vi.useRealTimers();

      const circuit = createCircuitBreaker({
        failureThreshold: 5,
        requestTimeout: 20, // Very short timeout
      });

      // Multiple timeouts with functions that never resolve
      for (let i = 0; i < 3; i++) {
        await expect(
          circuit.execute(() => new Promise(() => {})),
        ).rejects.toThrow(/timeout/i);
      }

      expect(circuit.getMetrics().totalTimeouts).toBe(3);

      // Restore fake timers for other tests
      vi.useFakeTimers();
    });
  });

  describe("executeWithFallback", () => {
    it("returns result on success", async () => {
      const circuit = createCircuitBreaker();
      const result = await circuit.executeWithFallback(
        async () => "success",
        "fallback",
      );
      expect(result).toBe("success");
    });

    it("returns fallback value when circuit is open", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 1 });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      const result = await circuit.executeWithFallback(
        async () => "success",
        "fallback",
      );
      expect(result).toBe("fallback");
    });

    it("returns fallback value when function throws", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 10 });

      const result = await circuit.executeWithFallback(async () => {
        throw new Error("fail");
      }, "fallback");

      expect(result).toBe("fallback");
    });

    it("calls fallback function when provided", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 1 });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      const fallbackFn = vi.fn().mockReturnValue("fallback-result");
      const result = await circuit.executeWithFallback(
        async () => "success",
        fallbackFn,
      );

      expect(fallbackFn).toHaveBeenCalled();
      expect(result).toBe("fallback-result");
    });

    it("supports async fallback functions", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 1 });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      const result = await circuit.executeWithFallback(
        async () => "success",
        async () => "async-fallback",
      );

      expect(result).toBe("async-fallback");
    });
  });

  describe("metrics tracking", () => {
    it("tracks totalRequests", async () => {
      const circuit = createCircuitBreaker();

      await circuit.execute(async () => "1");
      await circuit.execute(async () => "2");
      await circuit.execute(async () => "3");

      expect(circuit.getMetrics().totalRequests).toBe(3);
    });

    it("tracks totalFailures", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 10 });

      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();
      await circuit.execute(async () => "success");
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      expect(circuit.getMetrics().totalFailures).toBe(2);
    });

    it("tracks lastFailureTime", async () => {
      const circuit = createCircuitBreaker({ failureThreshold: 10 });

      vi.setSystemTime(new Date("2024-01-01T10:00:00Z"));

      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      expect(circuit.getMetrics().lastFailureTime).toBe(
        new Date("2024-01-01T10:00:00Z").getTime(),
      );
    });

    it("returns comprehensive metrics", async () => {
      // Use real timers for timeout testing
      vi.useRealTimers();

      const circuit = createCircuitBreaker({
        failureThreshold: 2,
        requestTimeout: 20,
      });

      // Some successes
      await circuit.execute(async () => "1");
      await circuit.execute(async () => "2");

      // A timeout - function that never resolves
      await expect(
        circuit.execute(() => new Promise(() => {})),
      ).rejects.toThrow(/timeout/i);

      // Another failure to open circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      // A rejection
      await expect(circuit.execute(async () => "3")).rejects.toThrow(
        CircuitBreakerError,
      );

      const metrics = circuit.getMetrics();

      expect(metrics.state).toBe("open");
      expect(metrics.totalRequests).toBe(5);
      expect(metrics.totalFailures).toBe(2);
      expect(metrics.totalTimeouts).toBe(1);
      expect(metrics.totalRejections).toBe(1);
      expect(metrics.consecutiveFailures).toBe(2);
      expect(metrics.lastFailureTime).not.toBeNull();

      // Restore fake timers for other tests
      vi.useFakeTimers();
    });
  });

  describe("shouldRecordFailure filter", () => {
    it("ignores errors that should not be recorded", async () => {
      const circuit = createCircuitBreaker({
        failureThreshold: 1,
        shouldRecordFailure: (error) => !error.message.includes("quota"),
      });

      // Quota error should not count
      await expect(
        circuit.execute(async () => {
          throw new Error("insufficient_quota");
        }),
      ).rejects.toThrow();

      expect(circuit.getState()).toBe("closed");
      expect(circuit.getMetrics().consecutiveFailures).toBe(0);
      expect(circuit.getMetrics().totalFailures).toBe(0);
    });

    it("records errors that pass the filter", async () => {
      const circuit = createCircuitBreaker({
        failureThreshold: 1,
        shouldRecordFailure: (error) => !error.message.includes("quota"),
      });

      // Regular error should count
      await expect(
        circuit.execute(async () => {
          throw new Error("server_error");
        }),
      ).rejects.toThrow();

      expect(circuit.getState()).toBe("open");
      expect(circuit.getMetrics().totalFailures).toBe(1);
    });
  });

  describe("manual controls", () => {
    describe("reset()", () => {
      it("resets circuit to closed state", async () => {
        const circuit = createCircuitBreaker({ failureThreshold: 1 });

        // Trip the circuit
        await expect(
          circuit.execute(async () => {
            throw new Error("fail");
          }),
        ).rejects.toThrow();

        expect(circuit.getState()).toBe("open");

        circuit.reset();

        expect(circuit.getState()).toBe("closed");
        expect(circuit.getMetrics().consecutiveFailures).toBe(0);
      });

      it("clears lastFailureTime", async () => {
        const circuit = createCircuitBreaker({ failureThreshold: 1 });

        await expect(
          circuit.execute(async () => {
            throw new Error("fail");
          }),
        ).rejects.toThrow();

        expect(circuit.getMetrics().lastFailureTime).not.toBeNull();

        circuit.reset();

        expect(circuit.getMetrics().lastFailureTime).toBeNull();
      });
    });

    describe("trip()", () => {
      it("manually opens the circuit", () => {
        const circuit = createCircuitBreaker();

        expect(circuit.getState()).toBe("closed");

        circuit.trip();

        expect(circuit.getState()).toBe("open");
      });

      it("sets consecutiveFailures to threshold", () => {
        const circuit = createCircuitBreaker({ failureThreshold: 5 });

        circuit.trip();

        expect(circuit.getMetrics().consecutiveFailures).toBe(5);
      });
    });
  });

  describe("logging", () => {
    it("logs state transitions when logger is provided", async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      };

      const circuit = createCircuitBreaker({
        failureThreshold: 1,
        logger: mockLogger,
      });

      // Trip the circuit
      await expect(
        circuit.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Circuit breaker 'test-circuit' state change",
        expect.objectContaining({
          from: "closed",
          to: "open",
        }),
      );
    });
  });

  describe("CircuitBreakerError", () => {
    it("has correct properties", () => {
      const error = new CircuitBreakerError("test-circuit");

      expect(error.message).toBe("Circuit breaker 'test-circuit' is open");
      expect(error.code).toBe("CIRCUIT_BREAKER_OPEN");
      expect(error.statusCode).toBe(503);
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({ circuitName: "test-circuit" });
    });

    it("includes additional context", () => {
      const error = new CircuitBreakerError("test-circuit", {
        context: { extra: "info" },
      });

      expect(error.context).toEqual({
        circuitName: "test-circuit",
        extra: "info",
      });
    });

    it("includes cause error", () => {
      const cause = new Error("underlying error");
      const error = new CircuitBreakerError("test-circuit", { cause });

      expect(error.cause).toBe(cause);
    });
  });
});
