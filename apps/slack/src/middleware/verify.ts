import crypto from "node:crypto";
import type { Context, Next, Env } from "hono";
import { getRequiredEnv } from "@usopc/shared";

const SLACK_VERSION = "v0";
const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Hono middleware that verifies incoming Slack request signatures.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackRequest(
  c: Context<{ Variables: { rawBody: string } }>,
  next: Next,
): Promise<Response | void> {
  const signingSecret = getRequiredEnv("SLACK_SIGNING_SECRET");
  const timestamp = c.req.header("x-slack-request-timestamp");
  const slackSignature = c.req.header("x-slack-signature");

  if (!timestamp || !slackSignature) {
    return c.json({ error: "Missing Slack signature headers" }, 401);
  }

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > TIMESTAMP_TOLERANCE_SECONDS) {
    return c.json({ error: "Request timestamp too old" }, 401);
  }

  const body = await c.req.text();
  // Store raw body for downstream handlers
  c.set("rawBody", body);

  const sigBasestring = `${SLACK_VERSION}:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(sigBasestring);
  const expectedSignature = `${SLACK_VERSION}=${hmac.digest("hex")}`;

  if (
    !crypto.timingSafeEqual(
      Buffer.from(slackSignature),
      Buffer.from(expectedSignature),
    )
  ) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  await next();
}
