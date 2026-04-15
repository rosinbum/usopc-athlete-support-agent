import type { Route } from "./+types/api.admin.discovery.run.js";
import { logger, createDiscoveryRunEntity } from "@usopc/shared";
import { getSession } from "../../server/session.js";
import { apiError } from "../../lib/apiResponse.js";
import { runDiscovery } from "../../lib/services/discovery-service.js";

const log = logger.child({ service: "admin-discovery-run" });

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request);
  if (!session?.user?.email) return apiError("Unauthorized", 401);
  if (session.user.role !== "admin") return apiError("Forbidden", 403);

  const entity = createDiscoveryRunEntity();
  const triggeredBy = session.user?.email ?? "unknown";

  try {
    await entity.markRunning(triggeredBy);
  } catch (err) {
    log.warn("Failed to write discovery run marker", { error: String(err) });
  }

  try {
    const stats = await runDiscovery();
    log.info("Manual discovery complete", { ...stats });

    try {
      await entity.markCompleted(stats);
    } catch (err) {
      log.warn("Failed to update discovery run marker", {
        error: String(err),
      });
    }

    return Response.json({ success: true, ...stats });
  } catch (error) {
    log.error("Manual discovery failed", { error: String(error) });

    try {
      await entity.markFailed(String(error));
    } catch (err) {
      log.warn("Failed to update discovery run marker", {
        error: String(err),
      });
    }

    return apiError("Discovery failed", 500);
  }
}
