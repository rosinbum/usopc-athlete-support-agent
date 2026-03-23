import { NextResponse } from "next/server";
import { logger } from "@usopc/shared";
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { apiError } from "../../../../../lib/apiResponse.js";
import { runDiscovery } from "../../../../../lib/services/discovery-service.js";

const log = logger.child({ service: "admin-discovery-run" });

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const stats = await runDiscovery();
    log.info("Manual discovery complete", { ...stats });
    return NextResponse.json({ success: true, ...stats });
  } catch (error) {
    log.error("Manual discovery failed", { error: String(error) });
    return apiError("Discovery failed", 500);
  }
}
