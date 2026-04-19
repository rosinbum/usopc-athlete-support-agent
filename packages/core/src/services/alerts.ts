import {
  getDefaultNotificationService,
  isQuotaError,
  logger,
} from "@usopc/shared";

const log = logger.child({ service: "service-alerts" });

/**
 * Fires a runtime alert when the given error is a quota/billing exhaustion
 * from an AI provider. Logs (but never throws) on notification failure.
 *
 * Alerts are deduplicated inside `NotificationService` by (kind, service) key,
 * so repeat quota errors from the same provider within the dedup window
 * produce a single email + Slack message.
 *
 * @returns the original error, so callers can `throw alertIfQuotaError(service, err);`
 */
export function alertIfQuotaError(service: string, error: unknown): unknown {
  if (!isQuotaError(error)) return error;

  const err = error instanceof Error ? error : new Error(String(error));

  try {
    void getDefaultNotificationService().sendRuntimeAlert({
      kind: "quota_exceeded",
      service,
      message: `AI provider quota exceeded: ${err.message}`,
      error: err,
    });
  } catch (notifyError) {
    log.warn("Failed to queue quota alert", {
      service,
      error:
        notifyError instanceof Error
          ? notifyError.message
          : String(notifyError),
    });
  }

  return error;
}

/**
 * Circuit-breaker `onOpen` callback factory. Sends a throttled runtime alert
 * when the named circuit trips.
 */
export function notifyOnCircuitOpen(
  service: string,
): (error: Error | undefined) => void {
  return (error) => {
    try {
      void getDefaultNotificationService().sendRuntimeAlert({
        kind: "circuit_opened",
        service,
        message: error
          ? `Circuit breaker '${service}' opened: ${error.message}`
          : `Circuit breaker '${service}' opened`,
        error,
      });
    } catch (notifyError) {
      log.warn("Failed to queue circuit-open alert", {
        service,
        error:
          notifyError instanceof Error
            ? notifyError.message
            : String(notifyError),
      });
    }
  };
}
