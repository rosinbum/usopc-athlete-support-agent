import { createLogger } from "@usopc/shared";

const logger = createLogger({ service: "fetch-with-retry" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchWithRetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs?: number;
  /** Request timeout in ms (default: 60000) */
  timeoutMs?: number;
  /** Status codes that trigger retry (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatusCodes?: number[];
}

export class FetchWithRetryError extends Error {
  readonly statusCode?: number | undefined;
  readonly attempts: number;
  readonly url: string;

  constructor(
    message: string,
    url: string,
    attempts: number,
    statusCode?: number,
  ) {
    super(message);
    this.name = "FetchWithRetryError";
    this.url = url;
    this.attempts = attempts;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate delay with exponential backoff and jitter.
 * Formula: min(maxDelay, baseDelay * 2^attempt) + random jitter
 */
function calculateBackoff(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter: +/- 25% of the delay
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for the specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a status code should trigger a retry.
 */
function isRetryableStatus(
  statusCode: number,
  retryableCodes: number[],
): boolean {
  return retryableCodes.includes(statusCode);
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Fetch with automatic retry on transient failures.
 *
 * Features:
 * - Exponential backoff with jitter
 * - Configurable timeout via AbortController
 * - Retries on network errors and specified HTTP status codes
 * - Structured error logging
 *
 * @param url - The URL to fetch
 * @param init - Standard fetch RequestInit options
 * @param options - Retry and timeout configuration
 * @returns The successful Response
 * @throws FetchWithRetryError on non-retryable errors or after max retries
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchWithRetryOptions,
): Promise<Response> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryableStatusCodes = DEFAULT_RETRYABLE_STATUS_CODES,
  } = options ?? {};

  let lastError: Error | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Set up timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.debug(`Fetch attempt ${attempt + 1}/${maxRetries + 1}`, {
        url,
        attempt: attempt + 1,
      });

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check if the response status is retryable
      if (!response.ok) {
        lastStatusCode = response.status;

        if (isRetryableStatus(response.status, retryableStatusCodes)) {
          logger.warn(`Retryable status ${response.status}, will retry`, {
            url,
            status: response.status,
            attempt: attempt + 1,
          });

          if (attempt < maxRetries) {
            const delay = calculateBackoff(attempt, initialDelayMs, maxDelayMs);
            await sleep(delay);
            continue;
          }
          // Last attempt with retryable status - will fall through to error at end
          break;
        } else {
          // Non-retryable status code - fail immediately
          throw new FetchWithRetryError(
            `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
            url,
            attempt + 1,
            response.status,
          );
        }
      }

      // Success!
      if (attempt > 0) {
        logger.info(`Fetch succeeded after ${attempt + 1} attempts`, {
          url,
          attempts: attempt + 1,
        });
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // If it's already our error type, re-throw
      if (error instanceof FetchWithRetryError) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's an abort (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn(`Request timed out after ${timeoutMs}ms`, {
          url,
          attempt: attempt + 1,
        });
      } else {
        logger.warn(`Network error: ${lastError.message}`, {
          url,
          attempt: attempt + 1,
          error: lastError.message,
        });
      }

      // If we have more retries, wait and try again
      if (attempt < maxRetries) {
        const delay = calculateBackoff(attempt, initialDelayMs, maxDelayMs);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  const errorMessage = lastStatusCode
    ? `Failed to fetch ${url} after ${maxRetries + 1} attempts: HTTP ${lastStatusCode}`
    : `Failed to fetch ${url} after ${maxRetries + 1} attempts: ${lastError?.message ?? "Unknown error"}`;

  logger.error(errorMessage, {
    url,
    attempts: maxRetries + 1,
    lastStatusCode,
    lastError: lastError?.message,
  });

  throw new FetchWithRetryError(
    errorMessage,
    url,
    maxRetries + 1,
    lastStatusCode,
  );
}
