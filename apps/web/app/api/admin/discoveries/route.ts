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

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam
      ? Math.max(1, Math.min(5000, Number(limitParam) || 1000))
      : 1000;

    const entity = createDiscoveredSourceEntity();
    const fetchLimit = limit + 1; // fetch N+1 to detect hasMore
    const discoveries = status
      ? await entity.getByStatus(status as DiscoveryStatus, {
          limit: fetchLimit,
        })
      : await entity.getAll({ limit: fetchLimit });

    const hasMore = discoveries.length > limit;
    return NextResponse.json({
      discoveries: hasMore ? discoveries.slice(0, limit) : discoveries,
      hasMore,
    });
  } catch (error) {
    log.error("Admin discoveries list error", { error: String(error) });
    return apiError("Failed to fetch discoveries", 500);
  }
}
