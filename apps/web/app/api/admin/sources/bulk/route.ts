import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool, getResource, logger } from "@usopc/shared";

const log = logger.child({ service: "admin-sources-bulk" });
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
import { apiError } from "../../../../../lib/apiResponse.js";
import {
  triggerIngestion,
  deleteSource,
} from "../../../../../lib/services/source-service.js";

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

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await request.json();
    const result = bulkSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Invalid input";
      return apiError(firstError, 400);
    }

    const { action, ids } = result.data;

    const entity = createSourceConfigEntity();
    let succeeded = 0;
    let failed = 0;

    // For ingest actions, verify queue is available before looping
    if (action === "ingest") {
      try {
        getResource("IngestionQueue");
      } catch {
        return apiError("Ingestion queue not available (dev environment)", 501);
      }
    }

    for (const id of ids) {
      try {
        if (action === "enable") {
          await entity.enable(id);
        } else if (action === "disable") {
          await entity.disable(id);
        } else if (action === "ingest") {
          const source = await entity.getById(id);
          if (!source) {
            failed++;
            continue;
          }
          await triggerIngestion(source);
        } else if (action === "delete") {
          const pool = getPool();
          await deleteSource(id, entity, pool);
        }
        succeeded++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    log.error("Admin bulk action error", { error: String(error) });
    return apiError("Failed to perform bulk action", 500);
  }
}
