import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createLogger } from "@usopc/shared";
import { dispatchEvent } from "./handlers/events.js";
import { handleSlashCommand, type SlackSlashCommand } from "./handlers/slashCommand.js";

const logger = createLogger({ service: "slack-dev" });

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

// In dev mode, skip signature verification for local testing
app.post("/slack/events", async (c) => {
  const payload = await c.req.json();
  const result = await dispatchEvent(payload);
  return c.json(JSON.parse(result.body), result.statusCode as 200);
});

app.post("/slack/commands", async (c) => {
  const body = await c.req.parseBody();
  const formData = body as Record<string, string>;

  const command: SlackSlashCommand = {
    command: formData.command ?? "/ask-athlete-support",
    text: formData.text ?? "",
    response_url: formData.response_url ?? "",
    trigger_id: formData.trigger_id ?? "",
    user_id: formData.user_id ?? "U_DEV_USER",
    user_name: formData.user_name ?? "dev_user",
    channel_id: formData.channel_id ?? "C_DEV_CHANNEL",
    channel_name: formData.channel_name ?? "dev",
  };

  const response = await handleSlashCommand(command);
  return c.json(response);
});

app.post("/slack/interactions", async (c) => {
  const body = await c.req.parseBody();
  const payloadStr = (body.payload as string) ?? "{}";
  const payload = JSON.parse(payloadStr);
  logger.info("Interaction received", { type: payload.type });
  return c.json({ ok: true });
});

const port = parseInt(process.env.SLACK_DEV_PORT ?? "3002", 10);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Slack bot dev server running on http://localhost:${info.port}`);
});
