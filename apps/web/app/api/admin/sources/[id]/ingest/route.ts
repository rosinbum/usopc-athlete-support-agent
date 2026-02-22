import { NextResponse } from "next/server";
import { logger } from "@usopc/shared";
import { requireAdmin } from "../../../../../../lib/admin-api.js";
import { apiError } from "../../../../../../lib/apiResponse.js";

const log = logger.child({ service: "admin-sources-ingest" });
import { createSourceConfigEntity } from "../../../../../../lib/source-config.js";
import { triggerIngestion } from "../../../../../../lib/services/source-service.js";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
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

    return NextResponse.json({ success: true, sourceId: id });
  } catch (error) {
    log.error("Admin source ingest error", { error: String(error) });
    return apiError("Failed to trigger ingestion", 500);
  }
}
