import { router, publicProcedure } from "../trpc.js";
import { getPoolStatus } from "../db/client.js";
import {
  getAnthropicCircuitMetrics,
  getEmbeddingsCircuitMetrics,
  getTavilyCircuitMetrics,
  getVectorStoreReadCircuitMetrics,
  getVectorStoreWriteCircuitMetrics,
} from "@usopc/core";

export const healthRouter = router({
  check: publicProcedure.query(async () => {
    const circuits = {
      anthropic: getAnthropicCircuitMetrics(),
      embeddings: getEmbeddingsCircuitMetrics(),
      tavily: getTavilyCircuitMetrics(),
      vectorStoreRead: getVectorStoreReadCircuitMetrics(),
      vectorStoreWrite: getVectorStoreWriteCircuitMetrics(),
    };

    const anyCircuitOpen = Object.values(circuits).some(
      (m) => m.state === "open",
    );

    return {
      status: anyCircuitOpen ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      version: "0.0.1",
      pool: getPoolStatus(),
      circuits,
    };
  }),
});
