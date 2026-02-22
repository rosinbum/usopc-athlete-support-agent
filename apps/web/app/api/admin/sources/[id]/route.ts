import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getPool,
  countChunksBySourceId,
  logger,
  type SourceConfig,
} from "@usopc/shared";

const log = logger.child({ service: "admin-sources" });
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
import { apiError } from "../../../../../lib/apiResponse.js";
import {
  updateSource,
  deleteSource,
} from "../../../../../lib/services/source-service.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const patchSourceSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    url: z.string().url("Must be a valid URL").optional(),
    format: z.enum(["pdf", "html", "text"]).optional(),
    documentType: z.string().min(1).optional(),
    topicDomains: z.array(z.string().min(1)).min(1).optional(),
    ngbId: z.string().nullable().optional(),
    priority: z.enum(["high", "medium", "low"]).optional(),
    authorityLevel: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "No valid fields to update",
  });

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
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

    const pool = getPool();
    const chunkCount = await countChunksBySourceId(pool, id);

    return NextResponse.json({ source, chunkCount });
  } catch (error) {
    log.error("Admin source detail error", { error: String(error) });
    return apiError("Failed to fetch source", 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH
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
    const result = patchSourceSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Invalid input";
      return apiError(firstError, 400);
    }

    // Cast is safe — Zod has validated the values above
    const data = result.data as Partial<Omit<SourceConfig, "id" | "createdAt">>;
    const entity = createSourceConfigEntity();
    const pool = getPool();
    const { source, actions } = await updateSource(id, data, entity, pool);

    return NextResponse.json({ source, actions });
  } catch (error) {
    log.error("Admin source update error", { error: String(error) });
    return apiError("Failed to update source", 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function DELETE(
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

    const pool = getPool();
    const { chunksDeleted } = await deleteSource(id, entity, pool);

    return NextResponse.json({
      success: true,
      sourceId: id,
      chunksDeleted,
    });
  } catch (error) {
    log.error("Admin source delete error", { error: String(error) });
    return apiError("Failed to delete source", 500);
  }
}
