import { Resend } from "resend";
import { getResendApiKey } from "./auth-env.js";
import { logger } from "@usopc/shared";

const log = logger.child({ module: "send-invite-email" });

// TODO: consider a dedicated reply-to domain separate from the webhost (#397)

function buildInviteHtml(appUrl: string, invitedBy?: string): string {
  const byLine = invitedBy ? ` by <strong>${invitedBy}</strong>` : "";
  return `
<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a1a;">You've been invited</h2>
  <p style="color: #333; line-height: 1.6;">
    You've been invited to the USOPC Athlete Support Agent${byLine}.
  </p>
  <p style="color: #333; line-height: 1.6;">
    Click the button below to sign in and get started.
  </p>
  <a href="${appUrl}/auth/login"
     style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">
    Sign In
  </a>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">
    If you didn't expect this invitation, you can safely ignore this email.
  </p>
</div>`.trim();
}

/**
 * Send an invite notification email via Resend.
 * Returns true on success, false on failure. Never throws.
 */
export async function sendInviteEmail(
  email: string,
  invitedBy?: string,
): Promise<boolean> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const fromAddress =
    process.env.EMAIL_FROM ?? "Athlete Support <noreply@localhost>";
  try {
    const resend = new Resend(getResendApiKey());
    await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: "You've been invited to USOPC Athlete Support",
      html: buildInviteHtml(appUrl, invitedBy),
    });
    return true;
  } catch (error) {
    log.error("Failed to send invite email", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
