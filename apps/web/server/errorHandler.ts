import type { NextFunction, Request, Response } from "express";
import {
  getDefaultNotificationService,
  isQuotaError,
  logger,
} from "@usopc/shared";

const log = logger.child({ service: "web-error-handler" });

/**
 * Global Express error-handling middleware.
 *
 * Behavior:
 * - Logs every error with the request path and method.
 * - For 5xx errors (or errors without a status), sends a throttled runtime
 *   alert via `NotificationService` — dedup by `web:<statusCode>:<errorName>`
 *   lives inside the shared service so a flood of the same error produces a
 *   single email per dedup window.
 * - For quota errors that slipped through service-level alerting, routes them
 *   through the `quota_exceeded` alert kind instead.
 * - Responds to the client with a sanitized JSON payload for /api routes, or
 *   delegates to the next handler otherwise (the React Router SSR handler
 *   renders its own error boundary).
 */
export function webErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const status = resolveStatus(err);

  log.error("Unhandled error in web request", {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    status,
  });

  if (status >= 500 || isQuotaError(err)) {
    const notifier = getDefaultNotificationService();
    void notifier.sendRuntimeAlert({
      kind: isQuotaError(err) ? "quota_exceeded" : "web_error",
      service: isQuotaError(err) ? "web-quota" : `web:${status}:${error.name}`,
      message: `${req.method} ${req.path} → ${status}: ${error.message}`,
      error,
      metadata: {
        path: req.path,
        method: req.method,
        status,
      },
    });
  }

  if (res.headersSent) {
    // Stream already started — nothing we can do but log.
    return;
  }

  if (req.path.startsWith("/api/")) {
    res.status(status).json({
      error: status >= 500 ? "Internal Server Error" : error.message,
      code: status >= 500 ? "INTERNAL_ERROR" : undefined,
    });
    return;
  }

  res
    .status(status)
    .type("text/plain")
    .send(status >= 500 ? "Internal Server Error" : error.message);
}

function resolveStatus(err: unknown): number {
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const direct = record.statusCode ?? record.status;
    if (typeof direct === "number" && direct >= 100 && direct < 600) {
      return direct;
    }
  }
  return 500;
}

/**
 * Attach process-level handlers so uncaught exceptions and unhandled
 * promise rejections log + alert rather than silently killing the worker.
 *
 * We don't call `process.exit` here — Cloud Run's health checks will cycle
 * the instance if it becomes unhealthy, and leaving the process up gives us
 * a fair chance to deliver the alert email before the container is recycled.
 */
export function registerProcessCrashHandlers(): void {
  process.on("uncaughtException", (error) => {
    log.error("uncaughtException", {
      error: error.message,
      stack: error.stack,
    });
    void getDefaultNotificationService().sendRuntimeAlert({
      kind: "runtime_error",
      service: "web:uncaughtException",
      message: error.message,
      error,
    });
  });

  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    log.error("unhandledRejection", {
      error: error.message,
      stack: error.stack,
    });
    void getDefaultNotificationService().sendRuntimeAlert({
      kind: "runtime_error",
      service: "web:unhandledRejection",
      message: error.message,
      error,
    });
  });
}
