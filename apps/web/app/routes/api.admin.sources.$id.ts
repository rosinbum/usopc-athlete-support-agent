import type { Route } from "./+types/api.admin.sources.$id.js";
import { z } from "zod";
import {
  getPool,
  countChunksBySourceId,
  FORMATS,
  PRIORITY_LEVELS,
  logger,
  type SourceConfig,
} from "@usopc/shared";

const log = logger.child({ service: "admin-sources" });
import { getSession } from "../../server/session.js";
import { createSourceConfigEntity } from "../../lib/source-config.js";
import { apiError } from "../../lib/apiResponse.js";
import {
  updateSource,
  deleteSource,
} from "../../lib/services/source-service.js";

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

const patchSourceSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    url: z.string().url("Must be a valid URL").optional(),
    format: z.enum(FORMATS).optional(),
    documentType: z.string().min(1).optional(),
    topicDomains: z.array(z.string().min(1)).min(1).optional(),
    ngbId: z.string().nullable().optional(),
    priority: z.enum(PRIORITY_LEVELS).optional(),
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

export async function loader({ request, params }: Route.LoaderArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { id } = params;
    const entity = createSourceConfigEntity();
    const source = await entity.getById(id);

    if (!source) {
      return apiError("Source not found", 404);
    }

    const pool = getPool();
    const chunkCount = await countChunksBySourceId(pool, id);

    return Response.json({ source, chunkCount });
  } catch (error) {
    log.error("Admin source detail error", { error: String(error) });
    return apiError("Failed to fetch source", 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH / DELETE — differentiated by request.method in action
// ---------------------------------------------------------------------------

export async function action({ request, params }: Route.ActionArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = params;

  if (request.method === "PATCH") {
    return handlePatch(request, id);
  }

  if (request.method === "DELETE") {
    return handleDelete(id);
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

async function handlePatch(request: Request, id: string) {
  try {
    const body = await request.json();
    const result = patchSourceSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.issues[0]?.message ?? "Invalid input";
      return apiError(firstError, 400);
    }

    // Cast is safe — Zod has validated the values above
    const data = result.data as Partial<Omit<SourceConfig, "id" | "createdAt">>;
    const entity = createSourceConfigEntity();
    const pool = getPool();
    const { source, actions } = await updateSource(id, data, entity, pool);

    return Response.json({ source, actions });
  } catch (error) {
    log.error("Admin source update error", { error: String(error) });
    return apiError("Failed to update source", 500);
  }
}

async function handleDelete(id: string) {
  try {
    const entity = createSourceConfigEntity();
    const source = await entity.getById(id);

    if (!source) {
      return apiError("Source not found", 404);
    }

    const pool = getPool();
    const { chunksDeleted } = await deleteSource(id, entity, pool);

    return Response.json({
      success: true,
      sourceId: id,
      chunksDeleted,
    });
  } catch (error) {
    log.error("Admin source delete error", { error: String(error) });
    return apiError("Failed to delete source", 500);
  }
}
