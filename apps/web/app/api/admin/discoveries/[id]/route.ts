import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@usopc/shared";
import { auth } from "../../../../../auth.js";

const log = logger.child({ service: "admin-discoveries" });
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { createDiscoveredSourceEntity } from "../../../../../lib/discovered-source.js";
import { apiError } from "../../../../../lib/apiResponse.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
import { sendDiscoveryToSources } from "../../../../../lib/send-to-sources.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("reject"),
    reason: z.string().min(1, "Reason is required for rejection"),
  }),
  z.object({
    action: z.literal("send_to_sources"),
  }),
]);

// ---------------------------------------------------------------------------
// GET — discovery detail
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const entity = createDiscoveredSourceEntity();
    const discovery = await entity.getById(id);

    if (!discovery) {
      return apiError("Discovery not found", 404);
    }

    return NextResponse.json({ discovery });
  } catch (error) {
    log.error("Admin discovery detail error", { error: String(error) });
    return apiError("Failed to fetch discovery", 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH — approve, reject, or send to sources
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json();
    const result = patchSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Invalid input";
      return apiError(firstError, 400);
    }

    const entity = createDiscoveredSourceEntity();
    const existing = await entity.getById(id);
    if (!existing) {
      return apiError("Discovery not found", 404);
    }

    const { action } = result.data;

    // -----------------------------------------------------------------------
    // send_to_sources
    // -----------------------------------------------------------------------
    if (action === "send_to_sources") {
      if (existing.status !== "approved") {
        return NextResponse.json(
          { error: "Discovery must be approved before sending to sources" },
          { status: 400 },
        );
      }

      const scEntity = createSourceConfigEntity();
      const sendResult = await sendDiscoveryToSources(
        existing,
        scEntity,
        entity,
      );

      if (sendResult.status === "failed") {
        return apiError(
          sendResult.error ?? "Failed to create source config",
          500,
        );
      }

      const discovery = await entity.getById(id);
      return NextResponse.json({ discovery, result: sendResult });
    }

    // -----------------------------------------------------------------------
    // approve / reject
    // -----------------------------------------------------------------------
    const session = await auth();
    const reviewedBy = session?.user?.email ?? "unknown";

    if (action === "approve") {
      await entity.approve(id, reviewedBy);
    } else {
      await entity.reject(id, reviewedBy, result.data.reason);
    }

    const discovery = await entity.getById(id);
    return NextResponse.json({ discovery });
  } catch (error) {
    log.error("Admin discovery update error", { error: String(error) });
    return apiError("Failed to update discovery", 500);
  }
}
