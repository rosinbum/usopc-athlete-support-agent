import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { createLogger } from "@usopc/shared";
import { verifySlackRequest } from "./middleware/verify.js";
import { dispatchEvent } from "./handlers/events.js";
import {
  handleSlashCommand,
  type SlackSlashCommand,
} from "./handlers/slashCommand.js";
import { postMessage } from "./slack/client.js";
import { buildErrorBlocks } from "./slack/blocks.js";

const logger = createLogger({ service: "slack-bot" });

type Env = { Variables: { rawBody: string } };
const app = new Hono<Env>();

// Health check (no signature verification)
app.get("/health", (c) => c.json({ status: "ok" }));

// All Slack routes require signature verification
app.use("/slack/*", verifySlackRequest);

/**
 * Slack Events API endpoint.
 * Receives event_callback payloads (messages, mentions) and url_verification challenges.
 */
app.post("/slack/events", async (c) => {
  try {
    const rawBody = c.get("rawBody") as string | undefined;
    const payload = rawBody ? JSON.parse(rawBody) : await c.req.json();

    const result = await dispatchEvent(payload);
    return c.json(JSON.parse(result.body), result.statusCode as 200);
  } catch (error) {
    logger.error("Error handling Slack event", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "Internal server error" }, 500);
  }
});

/**
 * Slack slash command endpoint.
 * Receives URL-encoded form data from /ask-athlete-support commands.
 */
app.post("/slack/commands", async (c) => {
  try {
    const rawBody = c.get("rawBody") as string | undefined;
    let formData: Record<string, string>;

    if (rawBody) {
      formData = Object.fromEntries(new URLSearchParams(rawBody));
    } else {
      const body = await c.req.parseBody();
      formData = body as Record<string, string>;
    }

    const command: SlackSlashCommand = {
      command: formData.command ?? "",
      text: formData.text ?? "",
      response_url: formData.response_url ?? "",
      trigger_id: formData.trigger_id ?? "",
      user_id: formData.user_id ?? "",
      user_name: formData.user_name ?? "",
      channel_id: formData.channel_id ?? "",
      channel_name: formData.channel_name ?? "",
    };

    const response = await handleSlashCommand(command);
    return c.json(response);
  } catch (error) {
    logger.error("Error handling slash command", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        response_type: "ephemeral",
        text: "An error occurred. Please try again.",
      },
      200,
    );
  }
});

/**
 * Slack interactive payloads endpoint.
 * Receives button clicks (feedback actions) and other interactive components.
 */
app.post("/slack/interactions", async (c) => {
  try {
    const rawBody = c.get("rawBody") as string | undefined;
    let interactionPayload: string;

    if (rawBody) {
      const params = new URLSearchParams(rawBody);
      interactionPayload = params.get("payload") ?? "{}";
    } else {
      const body = await c.req.parseBody();
      interactionPayload = (body.payload as string) ?? "{}";
    }

    const payload = JSON.parse(interactionPayload);

    if (payload.type === "block_actions") {
      for (const action of payload.actions ?? []) {
        if (
          action.action_id === "feedback_helpful" ||
          action.action_id === "feedback_not_helpful"
        ) {
          const isHelpful = action.action_id === "feedback_helpful";
          logger.info("Feedback received", {
            helpful: isHelpful,
            user: payload.user?.id,
            channel: payload.channel?.id,
          });

          // TODO: Store feedback via tRPC API

          // Acknowledge with ephemeral-style update
          try {
            const channel = payload.channel?.id;
            const messageTs = payload.message?.ts;
            if (channel && messageTs) {
              await postMessage(
                channel,
                isHelpful
                  ? "Thanks for the feedback! Glad I could help."
                  : "Thanks for the feedback. I'll work on improving.",
                undefined,
                messageTs,
              );
            }
          } catch {
            // Best-effort feedback acknowledgement
          }
        }
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    logger.error("Error handling interaction", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ ok: true });
  }
});

export const handler = handle(app);
