import type { Route } from "./+types/api.admin.sources.js";
import { z } from "zod";
import {
  TOPIC_DOMAINS,
  AUTHORITY_LEVELS,
  DOCUMENT_TYPES,
  FORMATS,
  PRIORITY_LEVELS,
  logger,
} from "@usopc/shared";

const log = logger.child({ service: "admin-sources" });
import { getSession } from "../../server/session.js";
import { createSourceConfigEntity } from "../../lib/source-config.js";
import { apiError } from "../../lib/apiResponse.js";

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

const createSourceSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  title: z.string().min(1, "Title is required"),
  documentType: z.enum(DOCUMENT_TYPES),
  topicDomains: z
    .array(z.enum(TOPIC_DOMAINS))
    .min(1, "At least one topic domain is required"),
  url: z.string().url("Must be a valid URL"),
  format: z.enum(FORMATS),
  ngbId: z.string().nullable(),
  priority: z.enum(PRIORITY_LEVELS),
  description: z.string().min(1, "Description is required"),
  authorityLevel: z.enum(AUTHORITY_LEVELS),
});

// ---------------------------------------------------------------------------
// GET — list all sources
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam
      ? Math.max(1, Math.min(5000, Number(limitParam) || 1000))
      : 1000;

    const entity = createSourceConfigEntity();
    const sources = await entity.getAll();
    const hasMore = sources.length > limit;
    return Response.json({
      sources: hasMore ? sources.slice(0, limit) : sources,
      hasMore,
    });
  } catch (error) {
    log.error("Admin sources list error", { error: String(error) });
    return apiError("Failed to fetch sources", 500);
  }
}

// ---------------------------------------------------------------------------
// POST — create a new source
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const result = createSourceSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        {
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const entity = createSourceConfigEntity();
    const source = await entity.create(result.data);

    return Response.json({ source }, { status: 201 });
  } catch (error) {
    // Unique constraint violation means ID already exists
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return apiError("A source with this ID already exists", 409);
    }

    log.error("Admin source create error", { error: String(error) });
    return apiError("Failed to create source", 500);
  }
}
