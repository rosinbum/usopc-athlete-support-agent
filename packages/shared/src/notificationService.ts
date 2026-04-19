import { Resend } from "resend";
import { getSecretValue } from "./env.js";
import { createLogger } from "./logger.js";

const logger = createLogger({ service: "notification-service" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveryCompletionSummary {
  totalDiscovered: number;
  byMethod: {
    map: number;
    search: number;
  };
  byStatus: {
    approved: number;
    rejected: number;
    pending: number;
  };
  costSummary: {
    tavilyCredits: number;
    anthropicCost: number;
  };
  duration: number;
  errors: string[];
}

export interface BudgetAlert {
  service: "tavily" | "anthropic";
  usage: number;
  budget: number;
  percentage: number;
  threshold: "warning" | "critical";
}

/**
 * Kinds of runtime alerts. Used for subject lines and for deduplication keys
 * so that, for example, repeated quota errors from the same provider don't
 * flood inboxes.
 */
export type RuntimeAlertKind =
  | "quota_exceeded"
  | "circuit_opened"
  | "web_error"
  | "runtime_error";

export interface RuntimeAlert {
  kind: RuntimeAlertKind;
  /** The upstream service/component (e.g. "anthropic", "openai-embeddings", "web"). */
  service: string;
  /** Short human-readable message. */
  message: string;
  /** Optional underlying error (used for stack traces in email body). */
  error?: Error | undefined;
  /** Structured metadata included in the alert body. */
  metadata?: Record<string, unknown> | undefined;
}

export interface NotificationChannels {
  slack?: string | undefined;
  email?: string | undefined;
}

/**
 * Options controlling throttling/deduplication of repeated alerts.
 */
export interface ThrottleOptions {
  /**
   * Deduplication window in milliseconds. Repeat alerts with the same
   * (kind, service) key inside this window are suppressed. Default: 3600000
   * (1 hour). Set to 0 to disable throttling.
   */
  dedupWindowMs?: number;
  /** Injected clock for tests. Default: Date.now. */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// NotificationService
// ---------------------------------------------------------------------------

/**
 * Sends notifications about discovery runs, budget alerts, and runtime errors.
 *
 * Channels:
 * - Structured logs (always enabled)
 * - Optional Slack webhook
 * - Optional Resend email
 *
 * Runtime alerts are deduplicated by (kind, service) within a sliding window
 * so that a persistent upstream failure doesn't produce hundreds of emails.
 */
export class NotificationService {
  private readonly channels: NotificationChannels;
  private resend: Resend | null = null;
  private readonly dedupWindowMs: number;
  private readonly now: () => number;
  private readonly lastSentAt = new Map<string, number>();

  constructor(
    channels?: Partial<NotificationChannels>,
    options: ThrottleOptions = {},
  ) {
    this.channels = {
      slack: channels?.slack ?? process.env.SLACK_WEBHOOK_URL,
      email: channels?.email ?? process.env.NOTIFICATION_EMAIL,
    };

    this.dedupWindowMs = options.dedupWindowMs ?? 60 * 60 * 1000;
    this.now = options.now ?? (() => Date.now());

    if (this.channels.email) {
      try {
        const apiKey = getSecretValue("RESEND_API_KEY");
        this.resend = new Resend(apiKey);
      } catch {
        logger.warn(
          "Resend API key not available — email notifications disabled",
        );
      }
    }

    logger.info("Notification service initialized", {
      slack: !!this.channels.slack,
      email: !!this.channels.email,
      dedupWindowMs: this.dedupWindowMs,
    });
  }

  // -------------------------------------------------------------------------
  // Discovery Notifications
  // -------------------------------------------------------------------------

  async sendDiscoveryCompletion(
    summary: DiscoveryCompletionSummary,
  ): Promise<void> {
    const message = this.formatDiscoveryMessage(summary);

    logger.info("Discovery run completed", { summary });

    if (this.channels.slack) {
      await this.sendSlackMessage(message, "Discovery Run Complete");
    }

    if (this.channels.email && this.resend) {
      await this.sendEmail(
        this.channels.email,
        "Source Discovery Run Complete",
        message,
      );
    }
  }

  private formatDiscoveryMessage(summary: DiscoveryCompletionSummary): string {
    const lines: string[] = [];
    lines.push("Source Discovery Run Complete");
    lines.push("============================");
    lines.push("");
    lines.push(`Total Discovered: ${summary.totalDiscovered}`);
    lines.push("");
    lines.push("By Method:");
    lines.push(`  Map: ${summary.byMethod.map}`);
    lines.push(`  Search: ${summary.byMethod.search}`);
    lines.push("");
    lines.push("By Status:");
    lines.push(`  Approved: ${summary.byStatus.approved}`);
    lines.push(`  Pending: ${summary.byStatus.pending}`);
    lines.push(`  Rejected: ${summary.byStatus.rejected}`);
    lines.push("");
    lines.push("Cost Summary:");
    lines.push(`  Tavily Credits: ${summary.costSummary.tavilyCredits}`);
    lines.push(
      `  Anthropic Cost: $${summary.costSummary.anthropicCost.toFixed(4)}`,
    );
    lines.push("");
    lines.push(`Duration: ${(summary.duration / 1000).toFixed(2)} seconds`);

    if (summary.errors.length > 0) {
      lines.push("");
      lines.push("Errors:");
      for (const error of summary.errors) {
        lines.push(`  - ${error}`);
      }
    }

    return lines.join("\n");
  }

  // -------------------------------------------------------------------------
  // Budget Notifications
  // -------------------------------------------------------------------------

  async sendBudgetAlert(alert: BudgetAlert): Promise<void> {
    const message = this.formatBudgetAlert(alert);

    const logLevel = alert.threshold === "critical" ? "error" : "warn";
    logger[logLevel]("Budget alert", { alert });

    const subject = `Budget ${alert.threshold === "critical" ? "CRITICAL" : "Warning"}: ${alert.service}`;

    if (this.channels.slack) {
      await this.sendSlackMessage(message, subject);
    }

    if (this.channels.email && this.resend) {
      await this.sendEmail(this.channels.email, subject, message);
    }
  }

  private formatBudgetAlert(alert: BudgetAlert): string {
    const lines: string[] = [];
    lines.push(
      `Budget ${alert.threshold === "critical" ? "CRITICAL" : "Warning"}: ${alert.service}`,
    );
    lines.push("=".repeat(50));
    lines.push("");

    if (alert.service === "tavily") {
      lines.push(`Usage: ${alert.usage} credits`);
      lines.push(`Budget: ${alert.budget} credits`);
    } else {
      lines.push(`Usage: $${alert.usage.toFixed(4)}`);
      lines.push(`Budget: $${alert.budget.toFixed(2)}`);
    }

    lines.push(`Percentage: ${alert.percentage.toFixed(1)}%`);
    lines.push("");

    if (alert.threshold === "critical") {
      lines.push("BUDGET EXCEEDED! Please review usage and adjust budgets.");
    } else {
      lines.push(
        "Warning: Budget usage is at 80%. Monitor closely to avoid overruns.",
      );
    }

    return lines.join("\n");
  }

  // -------------------------------------------------------------------------
  // Error Notifications
  // -------------------------------------------------------------------------

  /**
   * Send an unthrottled error notification. Prefer `sendRuntimeAlert` for
   * runtime errors that may repeat — this method always fires.
   */
  async sendError(
    context: string,
    error: Error | string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const errorMessage = typeof error === "string" ? error : error.message;
    const stack = typeof error === "string" ? undefined : error.stack;

    logger.error(`Error in ${context}`, {
      error: errorMessage,
      stack,
      ...metadata,
    });

    if (this.channels.slack) {
      const message = `Error in ${context}\n\n${errorMessage}${stack ? `\n\nStack:\n${stack}` : ""}`;
      await this.sendSlackMessage(message, `Error: ${context}`);
    }

    if (this.channels.email && this.resend) {
      const message = `Error in ${context}\n\n${errorMessage}${stack ? `\n\nStack:\n${stack}` : ""}\n\nMetadata:\n${JSON.stringify(metadata, null, 2)}`;
      await this.sendEmail(this.channels.email, `Error: ${context}`, message);
    }
  }

  // -------------------------------------------------------------------------
  // Runtime Alerts (throttled)
  // -------------------------------------------------------------------------

  /**
   * Send a deduplicated runtime alert. Returns true if the alert was sent,
   * false if it was suppressed by the dedup window.
   *
   * Dedup key is `${kind}:${service}`; the first call for a key sends, and
   * subsequent calls within `dedupWindowMs` are suppressed but still logged.
   */
  async sendRuntimeAlert(alert: RuntimeAlert): Promise<boolean> {
    const key = `${alert.kind}:${alert.service}`;
    const now = this.now();
    const last = this.lastSentAt.get(key);

    if (
      this.dedupWindowMs > 0 &&
      last !== undefined &&
      now - last < this.dedupWindowMs
    ) {
      logger.debug("Runtime alert suppressed by dedup window", {
        key,
        ageMs: now - last,
      });
      return false;
    }

    this.lastSentAt.set(key, now);

    const subject = formatRuntimeAlertSubject(alert);
    const body = formatRuntimeAlertBody(alert);

    logger.error(subject, {
      kind: alert.kind,
      service: alert.service,
      message: alert.message,
      stack: alert.error?.stack,
      metadata: alert.metadata,
    });

    if (this.channels.slack) {
      await this.sendSlackMessage(body, subject);
    }

    if (this.channels.email && this.resend) {
      await this.sendEmail(this.channels.email, subject, body);
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // Channel-Specific Methods
  // -------------------------------------------------------------------------

  private async sendSlackMessage(text: string, title?: string): Promise<void> {
    if (!this.channels.slack) return;

    try {
      const payload = {
        text: title ? `*${title}*\n\`\`\`\n${text}\n\`\`\`` : text,
      };

      const response = await fetch(this.channels.slack, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Slack webhook returned ${response.status}: ${await response.text()}`,
        );
      }

      logger.info("Slack notification sent", { title });
    } catch (error) {
      logger.error("Failed to send Slack notification", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    if (!this.resend) return;

    try {
      await this.resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@usopc.org",
        to: [to],
        subject: `[USOPC] ${subject}`,
        text: body,
      });

      logger.info("Email notification sent", { to, subject });
    } catch (error) {
      logger.error("Failed to send email notification", {
        error: error instanceof Error ? error.message : String(error),
        to,
        subject,
      });
    }
  }

  /** True if any external channel (Slack or email) is configured. */
  hasExternalChannels(): boolean {
    return !!(this.channels.slack || this.channels.email);
  }
}

function formatRuntimeAlertSubject(alert: RuntimeAlert): string {
  switch (alert.kind) {
    case "quota_exceeded":
      return `Quota Exceeded: ${alert.service}`;
    case "circuit_opened":
      return `Circuit Breaker Open: ${alert.service}`;
    case "web_error":
      return `Web Error: ${alert.service}`;
    case "runtime_error":
      return `Runtime Error: ${alert.service}`;
  }
}

function formatRuntimeAlertBody(alert: RuntimeAlert): string {
  const lines: string[] = [];
  lines.push(formatRuntimeAlertSubject(alert));
  lines.push("=".repeat(50));
  lines.push("");
  lines.push(alert.message);

  if (alert.error?.stack) {
    lines.push("");
    lines.push("Stack:");
    lines.push(alert.error.stack);
  }

  if (alert.metadata && Object.keys(alert.metadata).length > 0) {
    lines.push("");
    lines.push("Metadata:");
    lines.push(JSON.stringify(alert.metadata, null, 2));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Singleton / factory
// ---------------------------------------------------------------------------

export function createNotificationService(
  channels?: Partial<NotificationChannels>,
  options?: ThrottleOptions,
): NotificationService {
  return new NotificationService(channels, options);
}

let defaultInstance: NotificationService | null = null;

/**
 * Returns a lazily-initialised process-wide NotificationService. Used by
 * runtime callers (circuit breakers, service wrappers, web error handler)
 * that need a single dedup window across the process.
 */
export function getDefaultNotificationService(): NotificationService {
  if (!defaultInstance) {
    defaultInstance = new NotificationService();
  }
  return defaultInstance;
}

/** For tests: reset the singleton. */
export function resetDefaultNotificationService(): void {
  defaultInstance = null;
}
