import type { Route } from "./+types/api.admin.discoveries.$id.js";
import { z } from "zod";
import { REPROCESSABLE_STATUSES, logger } from "@usopc/shared";
import { getSession } from "../../server/session.js";

const log = logger.child({ service: "admin-discoveries" });
import { createDiscoveredSourceEntity } from "../../lib/discovered-source.js";
import { apiError } from "../../lib/apiResponse.js";
import { createSourceConfigEntity } from "../../lib/source-config.js";
import { sendDiscoveryToSources } from "../../lib/send-to-sources.js";
import { triggerIngestion } from "../../lib/services/source-service.js";
import { enqueueForReprocess } from "../../lib/services/discovery-reprocess.js";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAdmin(request: Request) {
  const session = await getSession(request);
  if (!session?.user?.email) return apiError("Unauthorized", 401);
  if (session.user.role !== "admin") return apiError("Forbidden", 403);
  return null;
}

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
  z.object({
    action: z.literal("reprocess"),
  }),
]);

// ---------------------------------------------------------------------------
// GET — discovery detail
// ---------------------------------------------------------------------------

export async function loader({ request, params }: Route.LoaderArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { id } = params;
    const entity = createDiscoveredSourceEntity();
    const discovery = await entity.getById(id);

    if (!discovery) {
      return apiError("Discovery not found", 404);
    }

    return Response.json({ discovery });
  } catch (error) {
    log.error("Admin discovery detail error", { error: String(error) });
    return apiError("Failed to fetch discovery", 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH — approve, reject, or send to sources
// ---------------------------------------------------------------------------

export async function action({ request, params }: Route.ActionArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { id } = params;
    const body = await request.json();
    const result = patchSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.issues[0]?.message ?? "Invalid input";
      return apiError(firstError, 400);
    }

    const entity = createDiscoveredSourceEntity();
    const existing = await entity.getById(id);
    if (!existing) {
      return apiError("Discovery not found", 404);
    }

    const { action: patchAction } = result.data;

    // -----------------------------------------------------------------------
    // send_to_sources
    // -----------------------------------------------------------------------
    if (patchAction === "send_to_sources") {
      if (existing.status !== "approved") {
        return Response.json(
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
      return Response.json({ discovery, result: sendResult });
    }

    // -----------------------------------------------------------------------
    // reprocess
    // -----------------------------------------------------------------------
    if (patchAction === "reprocess") {
      if (!REPROCESSABLE_STATUSES.has(existing.status)) {
        return apiError(
          "Only discoveries with pending_metadata or pending_content status can be reprocessed",
          400,
        );
      }

      await enqueueForReprocess([existing]);
      return Response.json({ queued: true, id });
    }

    // -----------------------------------------------------------------------
    // approve / reject
    // -----------------------------------------------------------------------
    const session = await getSession(request);
    const reviewedBy = session?.user?.email ?? "unknown";

    if (patchAction === "approve") {
      await entity.approve(id, reviewedBy);

      try {
        const scEntity = createSourceConfigEntity();
        const promoteResult = await sendDiscoveryToSources(
          { ...existing, status: "approved" as const },
          scEntity,
          entity,
        );
        if (promoteResult.status === "created" && promoteResult.sourceConfig) {
          try {
            await triggerIngestion(promoteResult.sourceConfig);
          } catch {
            // IngestionQueue unavailable in dev — non-fatal
          }
        }
      } catch (error) {
        log.warn("Auto-promote after approval failed", {
          discoveryId: id,
          error: String(error),
        });
      }
    } else if (result.data.action === "reject") {
      await entity.reject(id, reviewedBy, result.data.reason);
    }

    const discovery = await entity.getById(id);
    return Response.json({ discovery });
  } catch (error) {
    log.error("Admin discovery update error", { error: String(error) });
    return apiError("Failed to update discovery", 500);
  }
}
