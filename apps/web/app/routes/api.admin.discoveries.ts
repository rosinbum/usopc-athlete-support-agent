import type { Route } from "./+types/api.admin.discoveries.js";
import { logger } from "@usopc/shared";
import type { DiscoveryStatus } from "@usopc/shared";

const log = logger.child({ service: "admin-discoveries" });
import { getAdminSession } from "../../server/session.js";
import { createDiscoveredSourceEntity } from "../../lib/discovered-source.js";
import { apiError } from "../../lib/apiResponse.js";

const VALID_STATUSES = new Set<DiscoveryStatus>([
  "pending_metadata",
  "pending_content",
  "approved",
  "rejected",
]);

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAdmin(request: Request) {
  const session = await getAdminSession(request);
  if (!session?.user?.email) return apiError("Unauthorized", 401);
  if (session.user.role !== "admin") return apiError("Forbidden", 403);
  return null;
}

// ---------------------------------------------------------------------------
// GET — list discovered sources with optional status filter
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    if (status && !VALID_STATUSES.has(status as DiscoveryStatus)) {
      return apiError("Invalid status filter", 400);
    }

    const limitParam = url.searchParams.get("limit");
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
    return Response.json({
      discoveries: hasMore ? discoveries.slice(0, limit) : discoveries,
      hasMore,
    });
  } catch (error) {
    log.error("Admin discoveries list error", { error: String(error) });
    return apiError("Failed to fetch discoveries", 500);
  }
}
