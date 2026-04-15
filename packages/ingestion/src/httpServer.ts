import express from "express";
import { createLogger } from "@usopc/shared";
import type { DiscoveryFeedMessage } from "@usopc/core";
import { handleIngestionMessage } from "./worker.js";
import { handleDiscoveryFeedMessage } from "./discoveryFeedWorker.js";
import { handler as discoveryHandler } from "./functions/discovery.js";
import { handler as cronHandler } from "./cron.js";
import type { IngestionMessage } from "./cron.js";

const logger = createLogger({ service: "worker-http" });
const app: express.Express = express();

app.use(express.json({ limit: "10mb" }));

// ---------------------------------------------------------------------------
// Pub/Sub envelope decoding
// ---------------------------------------------------------------------------

interface PubSubEnvelope {
  message: {
    data: string; // base64-encoded JSON
    messageId: string;
    attributes?: Record<string, string>;
  };
  subscription: string;
}

/**
 * Decode the base64-encoded data from a Pub/Sub push message.
 */
function decodePubSubData<T>(req: express.Request): T {
  const envelope = req.body as PubSubEnvelope;
  const json = Buffer.from(envelope.message.data, "base64").toString("utf-8");
  return JSON.parse(json) as T;
}

// ---------------------------------------------------------------------------
// POST /ingestion — Pub/Sub push for ingestion messages
// ---------------------------------------------------------------------------

app.post("/ingestion", async (req: express.Request, res: express.Response) => {
  try {
    const message = decodePubSubData<IngestionMessage>(req);
    await handleIngestionMessage(message);
    res.status(200).json({ status: "ok" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Ingestion handler error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// POST /discovery-feed — Pub/Sub push for discovery feed messages
// ---------------------------------------------------------------------------

app.post(
  "/discovery-feed",
  async (req: express.Request, res: express.Response) => {
    try {
      const message = decodePubSubData<DiscoveryFeedMessage>(req);
      await handleDiscoveryFeedMessage(message);
      res.status(200).json({ status: "ok" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Discovery feed handler error: ${msg}`);
      res.status(500).json({ error: msg });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /cron/discovery — Cloud Scheduler trigger
// ---------------------------------------------------------------------------

app.post(
  "/cron/discovery",
  async (_req: express.Request, res: express.Response) => {
    try {
      await discoveryHandler();
      res.status(200).json({ status: "ok" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Discovery cron error: ${msg}`);
      res.status(500).json({ error: msg });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /cron/ingestion — Cloud Scheduler trigger
// ---------------------------------------------------------------------------

app.post(
  "/cron/ingestion",
  async (_req: express.Request, res: express.Response) => {
    try {
      await cronHandler();
      res.status(200).json({ status: "ok" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Ingestion cron error: ${msg}`);
      res.status(500).json({ error: msg });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /health — health check
// ---------------------------------------------------------------------------

app.get("/health", (_req: express.Request, res: express.Response) => {
  res
    .status(200)
    .json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT ?? "8080", 10);
app.listen(port, () => {
  logger.info(`Worker HTTP server listening on port ${port}`);
});

export { app };
