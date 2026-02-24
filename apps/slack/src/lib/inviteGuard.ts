import { createLogger, createInviteEntity } from "@usopc/shared";
import { getSlackClient } from "../slack/client.js";

const logger = createLogger({ service: "invite-guard" });

/**
 * Checks whether a Slack user is on the invite list by looking up their
 * email address via the Slack users.info API and checking against the
 * DynamoDB InviteEntity.
 *
 * Requires the `users:read.email` scope on the bot token.
 *
 * @returns true if the user is invited, false otherwise.
 */
export async function isUserInvited(slackUserId: string): Promise<boolean> {
  try {
    const slack = getSlackClient();
    const result = await slack.users.info({ user: slackUserId });

    if (!result.ok || !result.user) {
      logger.warn("Could not fetch Slack user info", { slackUserId });
      return false;
    }

    const email = result.user.profile?.email;
    if (!email) {
      logger.warn("Slack user has no email address", { slackUserId });
      return false;
    }

    const inviteEntity = createInviteEntity();
    const invited = await inviteEntity.isInvited(email);

    logger.info("Invite check result", { slackUserId, email, invited });
    return invited;
  } catch (error) {
    logger.error("Error checking invite status", {
      slackUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
