import { NextResponse } from "next/server";
import { logger, createDiscoveryRunEntity } from "@usopc/shared";
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { apiError } from "../../../../../lib/apiResponse.js";
import { runDiscovery } from "../../../../../lib/services/discovery-service.js";

const log = logger.child({ service: "admin-discovery-run" });

export async function POST() {
  const result = await requireAdmin({ returnSession: true });
  if (result.denied) return result.denied;

  const entity = createDiscoveryRunEntity();
  const triggeredBy = result.session.user?.email ?? "unknown";

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

    return NextResponse.json({ success: true, ...stats });
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
