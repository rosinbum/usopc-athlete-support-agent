import type { Route } from "./+types/api.admin.sources.bulk.js";
import { z } from "zod";
import { getPool, getResource, logger } from "@usopc/shared";

const log = logger.child({ service: "admin-sources-bulk" });
import { getAdminSession } from "../../server/session.js";
import { createSourceConfigEntity } from "../../lib/source-config.js";
import { apiError } from "../../lib/apiResponse.js";
import {
  triggerIngestion,
  deleteSource,
} from "../../lib/services/source-service.js";

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
// Validation
// ---------------------------------------------------------------------------

const bulkSchema = z.object({
  action: z.enum(["enable", "disable", "ingest", "delete"]),
  ids: z
    .array(z.string().min(1))
    .min(1, "At least one ID is required")
    .max(100),
});

export async function action({ request }: Route.ActionArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const result = bulkSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.issues[0]?.message ?? "Invalid input";
      return apiError(firstError, 400);
    }

    const { action: bulkAction, ids } = result.data;

    const entity = createSourceConfigEntity();
    let succeeded = 0;
    let failed = 0;

    // For ingest actions, verify queue is available before looping
    if (bulkAction === "ingest") {
      try {
        getResource("IngestionQueue");
      } catch {
        return apiError("Ingestion queue not available (dev environment)", 501);
      }
    }

    for (const id of ids) {
      try {
        if (bulkAction === "enable") {
          await entity.enable(id);
        } else if (bulkAction === "disable") {
          await entity.disable(id);
        } else if (bulkAction === "ingest") {
          const source = await entity.getById(id);
          if (!source) {
            failed++;
            continue;
          }
          await triggerIngestion(source);
        } else if (bulkAction === "delete") {
          const pool = getPool();
          await deleteSource(id, entity, pool);
        }
        succeeded++;
      } catch {
        failed++;
      }
    }

    return Response.json({ succeeded, failed });
  } catch (error) {
    log.error("Admin bulk action error", { error: String(error) });
    return apiError("Failed to perform bulk action", 500);
  }
}
