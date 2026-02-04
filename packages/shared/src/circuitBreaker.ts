import { AppError } from "./errors.js";
import type { Logger } from "./logger.js";

/**
 * Possible states for the circuit breaker.
 */
export type CircuitBreakerState = "closed" | "open" | "half-open";

/**
 * Configuration options for a circuit breaker instance.
 */
export interface CircuitBreakerConfig {
  /** Name identifier for logging and metrics */
  name: string;

  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;

  /** Milliseconds to wait before transitioning from open to half-open. Default: 30000 */
  resetTimeout?: number;

  /** Milliseconds before a request is considered timed out. Default: 10000 */
  requestTimeout?: number;

  /** Number of successful requests in half-open state before closing. Default: 2 */
  successThreshold?: number;

  /** Optional logger for state change events */
  logger?: Logger;

  /** Optional filter to decide if an error should be recorded as a failure */
  shouldRecordFailure?: (error: Error) => boolean;
}

/**
 * Metrics about circuit breaker state and history.
 */
export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failures: number;
  consecutiveFailures: number;
  totalRequests: number;
  totalFailures: number;
  totalTimeouts: number;
  totalRejections: number;
  lastFailureTime: number | null;
}

/**
 * Error thrown when the circuit is open and requests are rejected.
 */
export class CircuitBreakerError extends AppError {
  constructor(
    circuitName: string,
    options: {
      cause?: Error;
      context?: Record<string, unknown>;
    } = {},
  ) {
    super(`Circuit breaker '${circuitName}' is open`, {
      code: "CIRCUIT_BREAKER_OPEN",
      statusCode: 503,
      isOperational: true,
      cause: options.cause,
      context: { circuitName, ...options.context },
    });
  }
}

/**
 * Wraps a promise with a timeout, rejecting if it takes too long.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  circuitName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(`Request timeout after ${timeoutMs}ms for '${circuitName}'`),
      );
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Circuit Breaker pattern implementation.
 *
 * Protects external service calls from cascading failures by tracking
 * errors and "opening" the circuit when failures exceed a threshold.
 *
 * States:
 * - CLOSED: Requests pass through normally. Failures are tracked.
 * - OPEN: Requests are immediately rejected. After resetTimeout, transitions to HALF-OPEN.
 * - HALF-OPEN: Limited requests are allowed through. Successes close the circuit,
 *   failures reopen it.
 */
export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly requestTimeout: number;
  private readonly successThreshold: number;
  private readonly logger?: Logger;
  private readonly shouldRecordFailure: (error: Error) => boolean;

  private state: CircuitBreakerState = "closed";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime: number | null = null;
  private nextAttemptTime: number | null = null;

  // Lifetime metrics
  private totalRequests = 0;
  private totalFailures = 0;
  private totalTimeouts = 0;
  private totalRejections = 0;

  constructor(config: CircuitBreakerConfig) {
    this.name = config.name;
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeout = config.resetTimeout ?? 30_000;
    this.requestTimeout = config.requestTimeout ?? 10_000;
    this.successThreshold = config.successThreshold ?? 2;
    this.logger = config.logger;
    this.shouldRecordFailure = config.shouldRecordFailure ?? (() => true);
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * @throws {CircuitBreakerError} When the circuit is open
   * @throws The underlying error if the function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === "open") {
      // Check if we should transition to half-open
      if (this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
        this.transitionTo("half-open");
      } else {
        this.totalRejections++;
        throw new CircuitBreakerError(this.name);
      }
    }

    try {
      const result = await withTimeout(fn(), this.requestTimeout, this.name);
      this.onSuccess();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onFailure(err);
      throw err;
    }
  }

  /**
   * Execute a function with a fallback value when the circuit is open or fails.
   *
   * @param fn The function to execute
   * @param fallback The fallback value or function to call on failure
   */
  async executeWithFallback<T>(
    fn: () => Promise<T>,
    fallback: T | (() => T | Promise<T>),
  ): Promise<T> {
    try {
      return await this.execute(fn);
    } catch {
      if (typeof fallback === "function") {
        return (fallback as () => T | Promise<T>)();
      }
      return fallback;
    }
  }

  /**
   * Get the current state of the circuit.
   */
  getState(): CircuitBreakerState {
    // Check for automatic transition to half-open
    if (
      this.state === "open" &&
      this.nextAttemptTime &&
      Date.now() >= this.nextAttemptTime
    ) {
      this.transitionTo("half-open");
    }
    return this.state;
  }

  /**
   * Get comprehensive metrics about the circuit breaker.
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.getState(),
      failures: this.consecutiveFailures,
      consecutiveFailures: this.consecutiveFailures,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalTimeouts: this.totalTimeouts,
      totalRejections: this.totalRejections,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Manually reset the circuit to the closed state.
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.transitionTo("closed");
  }

  /**
   * Manually trip the circuit to the open state.
   */
  trip(): void {
    this.consecutiveFailures = this.failureThreshold;
    this.lastFailureTime = Date.now();
    this.nextAttemptTime = Date.now() + this.resetTimeout;
    this.transitionTo("open");
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;

    if (this.state === "half-open") {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.transitionTo("closed");
        this.consecutiveSuccesses = 0;
      }
    }
  }

  private onFailure(error: Error): void {
    // Check if error is a timeout
    if (error.message.includes("Request timeout")) {
      this.totalTimeouts++;
    }

    // Check if we should record this failure
    if (!this.shouldRecordFailure(error)) {
      return;
    }

    this.totalFailures++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.consecutiveSuccesses = 0;

    if (this.state === "half-open") {
      // Any failure in half-open state reopens the circuit
      this.nextAttemptTime = Date.now() + this.resetTimeout;
      this.transitionTo("open");
    } else if (
      this.state === "closed" &&
      this.consecutiveFailures >= this.failureThreshold
    ) {
      // Threshold exceeded, open the circuit
      this.nextAttemptTime = Date.now() + this.resetTimeout;
      this.transitionTo("open");
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    this.logger?.info(`Circuit breaker '${this.name}' state change`, {
      circuit: this.name,
      from: oldState,
      to: newState,
      consecutiveFailures: this.consecutiveFailures,
    });
  }
}
