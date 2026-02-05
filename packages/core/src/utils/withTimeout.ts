/**
 * Error thrown when an operation exceeds its time limit.
 */
export class TimeoutError extends Error {
  readonly operationName: string;
  readonly timeoutMs: number;

  constructor(operationName: string, timeoutMs: number) {
    super(`Operation '${operationName}' timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.operationName = operationName;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Races a promise against a timeout. Rejects with TimeoutError if the
 * timeout fires first.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
