import { serve } from "@hono/node-server";
import { app } from "./index.js";
import { createLogger } from "@usopc/shared";

const logger = createLogger({ service: "slack-server" });
const port = parseInt(process.env.PORT ?? "3001", 10);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Slack bot server running on http://localhost:${info.port}`);
});
