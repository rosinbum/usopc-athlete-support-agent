import type { Route } from "./+types/api.admin.sources.$id.ingest.js";
import { logger } from "@usopc/shared";
import { getSession } from "../../server/session.js";
import { apiError } from "../../lib/apiResponse.js";

const log = logger.child({ service: "admin-sources-ingest" });
import { createSourceConfigEntity } from "../../lib/source-config.js";
import { triggerIngestion } from "../../lib/services/source-service.js";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAdmin(request: Request) {
  const session = await getSession(request);
  if (!session?.user?.email) return apiError("Unauthorized", 401);
  if (session.user.role !== "admin") return apiError("Forbidden", 403);
  return null;
}

export async function action({ request, params }: Route.ActionArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { id } = params;
    const entity = createSourceConfigEntity();
    const source = await entity.getById(id);

    if (!source) {
      return apiError("Source not found", 404);
    }

    try {
      await triggerIngestion(source);
    } catch {
      return apiError("Ingestion queue not available (dev environment)", 501);
    }

    return Response.json({ success: true, sourceId: id });
  } catch (error) {
    log.error("Admin source ingest error", { error: String(error) });
    return apiError("Failed to trigger ingestion", 500);
  }
}
