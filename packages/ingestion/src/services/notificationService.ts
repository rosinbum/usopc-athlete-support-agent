import { createLogger } from "@usopc/shared";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

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
  duration: number; // in milliseconds
  errors: string[];
}

export interface BudgetAlert {
  service: "tavily" | "anthropic";
  usage: number;
  budget: number;
  percentage: number;
  threshold: "warning" | "critical"; // warning = 80%, critical = 100%
}

export interface NotificationChannels {
  cloudWatch: boolean; // always enabled
  slack?: string | undefined; // webhook URL
  email?: string | undefined; // SES email address
}

// ---------------------------------------------------------------------------
// NotificationService
// ---------------------------------------------------------------------------

/**
 * Service for sending notifications about discovery runs and budget alerts.
 *
 * Features:
 * - CloudWatch Logs (always enabled via logger)
 * - Optional Slack webhook integration
 * - Optional SES email notifications
 * - Discovery completion summaries
 * - Budget warnings and alerts
 * - Error notifications
 */
export class NotificationService {
  private channels: NotificationChannels;
  private sesClient: SESClient | null = null;

  constructor(channels?: Partial<NotificationChannels>) {
    this.channels = {
      cloudWatch: true,
      slack: channels?.slack ?? process.env.SLACK_WEBHOOK_URL,
      email: channels?.email ?? process.env.NOTIFICATION_EMAIL,
    };

    // Initialize SES client if email is configured
    if (this.channels.email) {
      this.sesClient = new SESClient({});
    }

    logger.info("Notification service initialized", {
      slack: !!this.channels.slack,
      email: !!this.channels.email,
    });
  }

  // ---------------------------------------------------------------------------
  // Discovery Notifications
  // ---------------------------------------------------------------------------

  /**
   * Send discovery completion summary notification to all configured channels.
   */
  async sendDiscoveryCompletion(
    summary: DiscoveryCompletionSummary,
  ): Promise<void> {
    const message = this.formatDiscoveryMessage(summary);

    // CloudWatch (always enabled)
    logger.info("Discovery run completed", { summary });

    // Slack
    if (this.channels.slack) {
      await this.sendSlackMessage(message, "Discovery Run Complete");
    }

    // Email
    if (this.channels.email && this.sesClient) {
      await this.sendEmail(
        this.channels.email,
        "Source Discovery Run Complete",
        message,
      );
    }
  }

  /**
   * Format discovery completion message for human consumption.
   */
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

  // ---------------------------------------------------------------------------
  // Budget Notifications
  // ---------------------------------------------------------------------------

  /**
   * Send budget alert notification to all configured channels.
   */
  async sendBudgetAlert(alert: BudgetAlert): Promise<void> {
    const message = this.formatBudgetAlert(alert);

    // CloudWatch (always enabled)
    const logLevel = alert.threshold === "critical" ? "error" : "warn";
    logger[logLevel]("Budget alert", { alert });

    // Slack
    if (this.channels.slack) {
      await this.sendSlackMessage(
        message,
        `Budget ${alert.threshold === "critical" ? "CRITICAL" : "Warning"}: ${alert.service}`,
      );
    }

    // Email
    if (this.channels.email && this.sesClient) {
      await this.sendEmail(
        this.channels.email,
        `Budget ${alert.threshold === "critical" ? "CRITICAL" : "Warning"}: ${alert.service}`,
        message,
      );
    }
  }

  /**
   * Format budget alert message for human consumption.
   */
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

  // ---------------------------------------------------------------------------
  // Error Notifications
  // ---------------------------------------------------------------------------

  /**
   * Send error notification to all configured channels.
   */
  async sendError(
    context: string,
    error: Error | string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const errorMessage = typeof error === "string" ? error : error.message;
    const stack = typeof error === "string" ? undefined : error.stack;

    // CloudWatch (always enabled)
    logger.error(`Error in ${context}`, {
      error: errorMessage,
      stack,
      ...metadata,
    });

    // Slack
    if (this.channels.slack) {
      const message = `Error in ${context}\n\n${errorMessage}${stack ? `\n\nStack:\n${stack}` : ""}`;
      await this.sendSlackMessage(message, `Error: ${context}`);
    }

    // Email
    if (this.channels.email && this.sesClient) {
      const message = `Error in ${context}\n\n${errorMessage}${stack ? `\n\nStack:\n${stack}` : ""}\n\nMetadata:\n${JSON.stringify(metadata, null, 2)}`;
      await this.sendEmail(this.channels.email, `Error: ${context}`, message);
    }
  }

  // ---------------------------------------------------------------------------
  // Channel-Specific Methods
  // ---------------------------------------------------------------------------

  /**
   * Send message to Slack via webhook.
   */
  private async sendSlackMessage(text: string, title?: string): Promise<void> {
    if (!this.channels.slack) return;

    try {
      const payload = {
        text: title ? `*${title}*\n\`\`\`\n${text}\n\`\`\`` : text,
      };

      const response = await fetch(this.channels.slack, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      // Don't throw - notification failures shouldn't break the main flow
    }
  }

  /**
   * Send email via AWS SES.
   */
  private async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    if (!this.sesClient) return;

    try {
      const command = new SendEmailCommand({
        Source: process.env.SES_FROM_EMAIL ?? "noreply@usopc.org",
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: `[USOPC Discovery] ${subject}`,
          },
          Body: {
            Text: {
              Data: body,
            },
          },
        },
      });

      await this.sesClient.send(command);
      logger.info("Email notification sent", { to, subject });
    } catch (error) {
      logger.error("Failed to send email notification", {
        error: error instanceof Error ? error.message : String(error),
        to,
        subject,
      });
      // Don't throw - notification failures shouldn't break the main flow
    }
  }

  /**
   * Check if any notifications are configured besides CloudWatch.
   */
  hasExternalChannels(): boolean {
    return !!(this.channels.slack || this.channels.email);
  }
}

/**
 * Create a NotificationService instance.
 * Useful for dependency injection and testing.
 */
export function createNotificationService(
  channels?: Partial<NotificationChannels>,
): NotificationService {
  return new NotificationService(channels);
}
