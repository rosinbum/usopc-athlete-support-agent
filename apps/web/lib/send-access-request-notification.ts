import { Resend } from "resend";
import { getResendApiKey } from "./auth-env.js";
import { logger } from "@usopc/shared";
import type { AccessRequest } from "@usopc/shared";

const log = logger.child({ module: "access-request-notification" });

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripCrlf(str: string): string {
  return str.replace(/[\r\n]/g, "");
}

function buildNotificationHtml(req: AccessRequest): string {
  const name = escapeHtml(req.name);
  const email = escapeHtml(req.email);
  const sportLine = req.sport
    ? `<p><strong>Sport:</strong> ${escapeHtml(req.sport)}</p>`
    : "";
  const roleLine = req.role
    ? `<p><strong>Role:</strong> ${escapeHtml(req.role)}</p>`
    : "";

  return `
<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #002244;">New Access Request</h2>
  <p><strong>Name:</strong> ${name}</p>
  <p><strong>Email:</strong> ${email}</p>
  ${sportLine}
  ${roleLine}
  <p><strong>Requested:</strong> ${req.requestedAt}</p>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">
    Review this request in the admin console.
  </p>
</div>`.trim();
}

/**
 * Notify admins about a new access request via Resend.
 * Returns true on success, false on failure. Never throws.
 */
export async function sendAccessRequestNotification(
  req: AccessRequest,
): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    log.warn("ADMIN_EMAIL not set, skipping access request notification");
    return false;
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Athlete Support <noreply@localhost>";

  try {
    const resend = new Resend(getResendApiKey());
    await resend.emails.send({
      from: fromAddress,
      to: adminEmail,
      subject: `Access Request: ${stripCrlf(req.name)} (${stripCrlf(req.email)})`,
      html: buildNotificationHtml(req),
    });
    return true;
  } catch (error) {
    log.error("Failed to send access request notification", {
      email: req.email,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
