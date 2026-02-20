import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@usopc/shared";
import type { DiscoveryStatus } from "@usopc/shared";

const log = logger.child({ service: "admin-discoveries" });
import { requireAdmin } from "../../../../lib/admin-api.js";
import { createDiscoveredSourceEntity } from "../../../../lib/discovered-source.js";
import { apiError } from "../../../../lib/apiResponse.js";

const VALID_STATUSES = new Set<DiscoveryStatus>([
  "pending_metadata",
  "pending_content",
  "approved",
  "rejected",
]);

// ---------------------------------------------------------------------------
// GET — list discovered sources with optional status filter
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const status = request.nextUrl.searchParams.get("status");

    if (status && !VALID_STATUSES.has(status as DiscoveryStatus)) {
      return apiError("Invalid status filter", 400);
    }

    const entity = createDiscoveredSourceEntity();
    const discoveries = status
      ? await entity.getByStatus(status as DiscoveryStatus)
      : await entity.getAll();

    return NextResponse.json({ discoveries });
  } catch (error) {
    log.error("Admin discoveries list error", { error: String(error) });
    return apiError("Failed to fetch discoveries", 500);
  }
}
