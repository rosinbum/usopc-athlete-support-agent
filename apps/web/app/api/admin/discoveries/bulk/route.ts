import { NextResponse } from "next/server";
import { z } from "zod";
import { REPROCESSABLE_STATUSES, logger } from "@usopc/shared";
import { auth } from "../../../../../auth.js";

const log = logger.child({ service: "admin-discoveries-bulk" });
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { createDiscoveredSourceEntity } from "../../../../../lib/discovered-source.js";
import { apiError } from "../../../../../lib/apiResponse.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
import { sendDiscoveryToSources } from "../../../../../lib/send-to-sources.js";
import { triggerIngestion } from "../../../../../lib/services/source-service.js";
import { enqueueForReprocess } from "../../../../../lib/services/discovery-reprocess.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    ids: z.array(z.string().min(1)).min(1, "At least one ID is required"),
  }),
  z.object({
    action: z.literal("reject"),
    ids: z.array(z.string().min(1)).min(1, "At least one ID is required"),
    reason: z.string().min(1, "Reason is required when rejecting"),
  }),
  z.object({
    action: z.literal("send_to_sources"),
    ids: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    action: z.literal("reprocess"),
    ids: z.array(z.string().min(1)).optional(),
  }),
]);

// ---------------------------------------------------------------------------
// POST — bulk approve/reject/send-to-sources discoveries
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await request.json();
    const result = bulkSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.issues[0]?.message ?? "Invalid input";
      return apiError(firstError, 400);
    }

    const { action } = result.data;
    const entity = createDiscoveredSourceEntity();

    // -----------------------------------------------------------------------
    // send_to_sources
    // -----------------------------------------------------------------------
    if (action === "send_to_sources") {
      const scEntity = createSourceConfigEntity();
      let discoveries;

      if (result.data.ids && result.data.ids.length > 0) {
        const fetched = await Promise.all(
          result.data.ids.map((id) => entity.getById(id)),
        );
        discoveries = fetched.filter(
          (d): d is NonNullable<typeof d> => d !== null,
        );
      } else {
        const all = await entity.getByStatus("approved");
        discoveries = all.filter((d) => !d.sourceConfigId);
      }

      let created = 0;
      let alreadyLinked = 0;
      let duplicateUrl = 0;
      let notApproved = 0;
      let failed = 0;

      // Fetch all existing sources once to avoid repeated getAll() in the loop
      const existingSources = await scEntity.getAll();

      for (const d of discoveries) {
        const r = await sendDiscoveryToSources(d, scEntity, entity, {
          existingSources,
        });
        if (r.status === "created") {
          // Add newly created source to the list so subsequent iterations detect it
          existingSources.push({
            id: d.id,
            url: d.url,
          } as (typeof existingSources)[number]);
          created++;
        } else if (r.status === "already_linked") alreadyLinked++;
        else if (r.status === "duplicate_url") duplicateUrl++;
        else if (r.status === "not_approved") notApproved++;
        else failed++;
      }

      return NextResponse.json({
        created,
        alreadyLinked,
        duplicateUrl,
        notApproved,
        failed,
      });
    }

    // -----------------------------------------------------------------------
    // reprocess
    // -----------------------------------------------------------------------
    if (action === "reprocess") {
      let discoveries;

      if (result.data.ids && result.data.ids.length > 0) {
        const fetched = await Promise.all(
          result.data.ids.map((id) => entity.getById(id)),
        );
        discoveries = fetched.filter(
          (d): d is NonNullable<typeof d> =>
            d !== null && REPROCESSABLE_STATUSES.has(d.status),
        );
      } else {
        const [pm, pc] = await Promise.all([
          entity.getByStatus("pending_metadata"),
          entity.getByStatus("pending_content"),
        ]);
        discoveries = [...pm, ...pc];
      }

      const { queued, failed } = await enqueueForReprocess(discoveries);
      const skipped =
        result.data.ids && result.data.ids.length > 0
          ? result.data.ids.length - discoveries.length
          : 0;

      return NextResponse.json({ queued, skipped, failed });
    }

    // -----------------------------------------------------------------------
    // approve / reject
    // -----------------------------------------------------------------------
    const session = await auth();
    const reviewedBy = session?.user?.email ?? "unknown";
    const { ids } = result.data as { ids: string[] };

    let succeeded = 0;
    let failed = 0;
    let promoted = 0;

    const scEntity =
      result.data.action === "approve" ? createSourceConfigEntity() : undefined;

    for (const id of ids) {
      try {
        if (result.data.action === "approve") {
          await entity.approve(id, reviewedBy);

          try {
            const existing = await entity.getById(id);
            if (existing && scEntity) {
              const promoteResult = await sendDiscoveryToSources(
                { ...existing, status: "approved" as const },
                scEntity,
                entity,
              );
              if (
                promoteResult.status === "created" &&
                promoteResult.sourceConfig
              ) {
                try {
                  await triggerIngestion(promoteResult.sourceConfig);
                } catch {
                  // IngestionQueue unavailable in dev — non-fatal
                }
                promoted++;
              }
            }
          } catch {
            // Promotion failed — non-fatal, cron will catch up
          }
        } else if (result.data.action === "reject") {
          await entity.reject(id, reviewedBy, result.data.reason);
        }
        succeeded++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ succeeded, failed, promoted });
  } catch (error) {
    log.error("Admin bulk discovery action error", { error: String(error) });
    return apiError("Failed to perform bulk action", 500);
  }
}
