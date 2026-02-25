import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { createLogger, createFeedbackEntity } from "@usopc/shared";
import { verifySlackRequest } from "./middleware/verify.js";
import { dispatchEvent } from "./handlers/events.js";
import {
  handleSlashCommand,
  type SlackSlashCommand,
} from "./handlers/slashCommand.js";
import { postMessage } from "./slack/client.js";

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

    const retryNum = parseInt(c.req.header("x-slack-retry-num") ?? "0", 10);
    const result = await dispatchEvent(payload, retryNum);
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
      formData = Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, String(v ?? "")]),
      );
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
      interactionPayload = String(body.payload ?? "{}");
    }

    const payload = JSON.parse(interactionPayload);

    if (payload.type === "block_actions") {
      for (const action of payload.actions ?? []) {
        if (
          action.action_id === "feedback_helpful" ||
          action.action_id === "feedback_not_helpful"
        ) {
          const isHelpful = action.action_id === "feedback_helpful";
          const messageTs = payload.message?.ts as string | undefined;
          const threadTs = payload.message?.thread_ts as string | undefined;
          logger.info("Feedback received", {
            helpful: isHelpful,
            user: payload.user?.id,
            channel: payload.channel?.id,
            messageTs,
            threadTs,
          });

          // Persist feedback to DynamoDB
          try {
            const feedbackEntity = createFeedbackEntity();
            await feedbackEntity.create({
              conversationId: threadTs ?? messageTs ?? "",
              channel: "slack",
              score: isHelpful ? 1 : 0,
              messageId: messageTs,
              userId: payload.user?.id as string | undefined,
            });
          } catch (err) {
            logger.error("Failed to persist feedback", {
              error: err instanceof Error ? err.message : String(err),
            });
          }

          // Acknowledge with ephemeral-style update
          try {
            const channel = payload.channel?.id;
            const ts = payload.message?.ts;
            if (channel && ts) {
              await postMessage(
                channel,
                isHelpful
                  ? "Thanks for the feedback! Glad I could help."
                  : "Thanks for the feedback. I'll work on improving.",
                undefined,
                ts,
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
    return c.json(
      { ok: false, error: "Internal error processing interaction" },
      200,
    );
  }
});

export const handler = handle(app);
